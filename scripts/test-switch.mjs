// "Eat here this meal": warden flag, crowd rule, single-meal pass, scanner at the other mess, billing log. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";
import { signAddonTicket } from "../src/lib/access/addon-ticket.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const PIN = "482913";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const setting = (k, v) => admin.from("app_settings").upsert({ key: k, value: v });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const priorSwitch = (await admin.from("app_settings").select("value").eq("key", "allow_mess_switch").single()).data?.value ?? "off";
const { data: slotsB } = await admin.from("mess_slots").select("*").eq("mess_id", "ifc-b");
const demoRows = [];
const addCrowd = async (mess, n) => { const rows = Array.from({ length: n }, () => ({ mess_id: mess, scanned_at: new Date(Date.now() - 60e3).toISOString() })); const { data } = await admin.from("demo_crowd_scans").insert(rows).select("id"); demoRows.push(...data.map((d) => d.id)); return data.map((d) => d.id); };
const resetPasses = async () => { await admin.from("mess_switch_passes").delete().neq("id", NIL); await admin.from("meal_redemptions").delete().neq("id", NIL); await admin.from("scanner_devices").delete().neq("id", NIL); };
let browser;
try {
  await resetPasses();
  for (const s of slotsB) await admin.from("mess_slots").update(s.slot === "lunch" ? { starts: "00:00", ends: "23:59" } : { starts: "03:00", ends: "03:01" }).eq("mess_id", "ifc-b").eq("slot", s.slot);
  await setting("allow_mess_switch", "off");
  const student = await as("student@student.nitw.ac.in"), warden = await as("warden@nitw.ac.in"), s2 = await as("student2@student.nitw.ac.in"), counter = await as("counter@nitw.ac.in");
  const ids = await addCrowd("ifc-a", 150); // ifc-a about 75% (150 / (800/4)), ifc-b near 0 apart from any seeded demo rows

  check("flag off (demo mode off): the pass is refused", /switching_off/.test((await student.rpc("issue_switch_pass", { p_to_mess: "ifc-b" })).error?.message ?? ""));
  check("a student cannot flip the warden flag", !!(await student.rpc("set_mess_switch", { p_on: true })).error);
  check("the warden can switch it on", !(await warden.rpc("set_mess_switch", { p_on: true })).error);
  const bump = await addCrowd("ifc-b", 400); // ifc-b now busier than ifc-a
  check("a busier target mess is refused (must be less crowded)", /not_less_crowded/.test((await student.rpc("issue_switch_pass", { p_to_mess: "ifc-b" })).error?.message ?? ""));
  await admin.from("demo_crowd_scans").delete().in("id", bump);
  check("own mess is refused", /bad_mess/.test((await student.rpc("issue_switch_pass", { p_to_mess: "ifc-a" })).error?.message ?? ""));
  check("the ladies' mess is not eligible", /not_eligible/.test((await student.rpc("issue_switch_pass", { p_to_mess: "priyadarshini" })).error?.message ?? ""));
  check("counter staff cannot get a pass", !!(await counter.rpc("issue_switch_pass", { p_to_mess: "ifc-b" })).error);

  // UI: card with the quieter mess
  browser = await chromium.launch();
  const sctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await sctx.addCookies((await sessionCookies("student@student.nitw.ac.in")).cookies);
  const sp = await sctx.newPage();
  const vis = (l, ms = 12000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
  await sp.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  check("student dashboard offers IFC-B as a quieter mess", await vis(sp.getByTestId("eat-ifc-b")));
  check("...but not IFC-A (own) or Priyadarshini", !(await sp.getByTestId("eat-ifc-a").isVisible()) && !(await sp.getByTestId("eat-priyadarshini").isVisible()));
  await sp.getByTestId("eat-ifc-b").click();
  check("'Eat here this meal' issues a signed pass QR", await vis(sp.getByTestId("pass-ticket")) && /^ramA\./.test(await sp.getByTestId("pass-ticket").getAttribute("data-ticket")));
  await sp.screenshot({ path: "screenshots/switch-pass-390-light.png", fullPage: true });
  const pass = (await admin.from("mess_switch_passes").select("*").single()).data;
  check("the pass is logged for billing (from IFC-A to IFC-B, with crowd levels)", pass.from_mess === "ifc-a" && pass.to_mess === "ifc-b" && pass.status === "issued" && pass.from_pct > pass.to_pct, JSON.stringify(pass));
  check("a second pass for the same meal is refused", /already_issued/.test((await student.rpc("issue_switch_pass", { p_to_mess: "ifc-b" })).error?.message ?? ""));
  check("another student cannot see the pass", ((await s2.from("mess_switch_passes").select("id")).data ?? []).length === 0);

  // scanner at IFC-B (the IFC-B admin) accepts the pass once, offline
  await fetch(`${BASE}/api/addons/key`);
  const kr = (await admin.from("addon_keys").select("private_jwk").single()).data;
  const priv = await crypto.subtle.importKey("jwk", JSON.parse(kr.private_jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ticket = await signAddonTicket(priv, { i: pass.id, m: "ifc-b", d: pass.meal_date, s: pass.slot, n: "IFC-A", u: "Demo Student", k: "pass" });
  const wrong = await signAddonTicket(priv, { i: pass.id, m: "krishna", d: pass.meal_date, s: pass.slot, n: "IFC-A", u: "Demo Student", k: "pass" });
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await cctx.addCookies((await sessionCookies("admin-ifcb@nitw.ac.in")).cookies);
  const cp = await cctx.newPage();
  await cp.goto(`${BASE}/dashboard/counter/scan?debug=1`, { waitUntil: "networkidle" });
  await cp.getByLabel("Choose a shift PIN").fill(PIN); await cp.getByLabel("Repeat the PIN").fill(PIN);
  await cp.getByRole("button", { name: "Start shift" }).click();
  check("IFC-B scanner shift starts", await vis(cp.getByText(/Shift data valid until/)));
  await cctx.setOffline(true);
  const paste = async (t) => { await cp.getByTestId("debug-code").fill(t); await cp.getByRole("button", { name: "Check" }).click(); await wait(800); return cp.getByTestId("scan-result").innerText(); };
  check("OFFLINE: a pass for another mess is refused", /another mess/.test(await paste(wrong)));
  const ok = await paste(ticket);
  check("OFFLINE: IFC-B accepts the pass from IFC-A", /Meal pass OK/.test(ok) && /IFC-A/.test(ok), ok);
  await wait(2800);
  check("OFFLINE: the same pass twice is refused", /already used/i.test(await paste(ticket)));
  await cctx.setOffline(false);
  let st; for (let i = 0; i < 20; i++) { st = (await admin.from("mess_switch_passes").select("status, redemption_id").eq("id", pass.id).single()).data; if (st.status === "redeemed") break; await wait(1000); }
  check("after sync the pass is redeemed and a meal is recorded at IFC-B", st.status === "redeemed" && !!st.redemption_id, JSON.stringify(st));
  const red = (await admin.from("meal_redemptions").select("mess_id, status, student_id").eq("id", st.redemption_id).single()).data;
  check("the accepted meal belongs to the student at IFC-B (billing)", red.mess_id === "ifc-b" && red.status === "accepted" && red.student_id === "11111111-1111-1111-1111-111111111111", JSON.stringify(red));
  check("the warden sees the pass in the log", ((await warden.from("mess_switch_passes").select("id")).data ?? []).length === 1);
  await admin.from("demo_crowd_scans").delete().in("id", ids);
} finally {
  await browser?.close();
  for (const s of slotsB) await admin.from("mess_slots").update({ starts: s.starts, ends: s.ends }).eq("mess_id", "ifc-b").eq("slot", s.slot);
  if (demoRows.length) await admin.from("demo_crowd_scans").delete().in("id", demoRows);
  await setting("allow_mess_switch", priorSwitch);
  await resetPasses();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL SWITCH TESTS PASSED");
process.exit(failed ? 1 : 0);
