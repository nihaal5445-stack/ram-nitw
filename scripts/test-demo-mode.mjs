// DEMO MODE + the IFC-B Chicken Curry add-on, end to end (student2 pays, admin-ifcb scans offline, sync redeems). Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
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
const setMode = (on) => admin.from("app_settings").upsert({ key: "demo_mode", value: on ? "on" : "off" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prior = (await admin.from("app_settings").select("value").eq("key", "demo_mode").single()).data?.value === "on";
const reset = async () => { await admin.from("addon_purchases").delete().neq("id", NIL); await admin.from("scanner_devices").delete().neq("id", NIL); await admin.from("addons").update({ sold: 0 }).neq("id", NIL); };
let browser;
try {
  await reset();
  // seed accounts
  const s2 = await as("student2@student.nitw.ac.in"), a2 = await as("admin-ifcb@nitw.ac.in");
  const p2 = (await s2.from("profiles").select("role, assigned_mess_id, roll_number").single()).data;
  check("student2 is a student of IFC-B with roll DEMO0002", p2?.role === "student" && p2.assigned_mess_id === "ifc-b" && p2.roll_number === "DEMO0002", JSON.stringify(p2));
  const pa = (await a2.from("profiles").select("role, assigned_mess_id").eq("email", "admin-ifcb@nitw.ac.in").single()).data;
  check("admin-ifcb is the mess admin of IFC-B", pa?.role === "mess_admin" && pa.assigned_mess_id === "ifc-b", JSON.stringify(pa));
  const { data: curry } = await s2.from("addons").select("*").eq("name", "Chicken Curry").single();
  check("student2 sees the Rs 50 Chicken Curry (stock 40)", curry?.price_paise === 5000 && curry.stock_total === 40, JSON.stringify(curry));
  check("IFC-B admin can edit IFC-B add-ons", !(await a2.rpc("upsert_addon", { p_id: curry.id, p_name: "Chicken Curry", p_price_paise: 5000, p_stock: 40, p_active: true })).error);
  check("...and editing without the veg flag keeps Chicken Curry non-veg (regression)", (await admin.from("addons").select("veg").eq("id", curry.id).single()).data.veg === false);

  // park every IFC-B slot far from now so ONLY demo mode can make "now" an open slot
  const { data: slots } = await admin.from("mess_slots").select("*").eq("mess_id", "ifc-b");
  // park every IFC-B window ~12 h away from now (distinct 5-minute offsets, so "nearest slot" is unambiguous)
  const ist = new Date(Date.now() + 5.5 * 3600e3), nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const hhmm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, "0")}`;
  const park = async () => { let i = 0; for (const s of slots) { const st = nowMin + 720 + 5 * i++; await admin.from("mess_slots").update({ starts: hhmm(st), ends: hhmm(st + 2) }).eq("mess_id", "ifc-b").eq("slot", s.slot); } };
  const unpark = async () => { for (const s of slots) await admin.from("mess_slots").update({ starts: s.starts, ends: s.ends }).eq("mess_id", "ifc-b").eq("slot", s.slot); };
  await park();
  try {
    await setMode(false);
    const sl = execSync(`docker exec -i supabase_db_ram-nitw psql -U postgres -tAc "select coalesce(public.effective_slot('ifc-b', now()), 'NONE')"`).toString().trim();
    check("DEMO OFF: real rules, no open slot for IFC-B right now", sl === "NONE", sl);
    check("DEMO OFF: no badge on the public site", !(await (await fetch(`${BASE}/`)).text()).includes('data-testid="demo-badge"'));

    await setMode(true);
    const on = await s2.rpc("buy_addon", { p_addon: curry.id });
    check("DEMO ON: purchase works at any time of day (mock payment)", !on.error && /^TEST-/.test(on.data.payment_ref), on.error?.message);
    check("DEMO ON: 'Demo mode' badge shown on the public site", (await (await fetch(`${BASE}/`)).text()).includes('data-testid="demo-badge"'));
    const pid = on.data.id, slot = on.data.slot;

    const { data: keyRow } = await admin.from("addon_keys").select("private_jwk").single().then((r) => r.data ? r : { data: null });
    await fetch(`${BASE}/api/addons/key`); // creates the key on first use
    const kr = (await admin.from("addon_keys").select("private_jwk").single()).data ?? keyRow;
    const priv = await crypto.subtle.importKey("jwk", JSON.parse(kr.private_jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const ticket = await signAddonTicket(priv, { i: pid, m: "ifc-b", d: on.data.meal_date, s: slot, n: "Chicken Curry", u: "Demo Student Two" });

    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies((await sessionCookies("admin-ifcb@nitw.ac.in")).cookies);
    const page = await ctx.newPage();
    const vis = (l, ms = 10000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
    await page.goto(`${BASE}/dashboard/counter/scan?debug=1`, { waitUntil: "networkidle" });
    check("DEMO ON: badge in the dashboard header", await vis(page.getByTestId("demo-badge").first()));
    await page.getByLabel("Choose a shift PIN").fill(PIN);
    await page.getByLabel("Repeat the PIN").fill(PIN);
    await page.getByRole("button", { name: "Start shift" }).click();
    check("IFC-B admin starts a scanner shift", await vis(page.getByText(/Shift data valid until/)));
    await ctx.setOffline(true);
    await page.getByTestId("debug-code").fill(ticket);
    await page.getByRole("button", { name: "Check" }).click();
    await wait(800);
    const txt = await page.getByTestId("scan-result").innerText();
    check("OFFLINE: Chicken Curry ticket accepted for Demo Student Two while every real slot is closed", /Chicken Curry/.test(txt) && /Demo Student Two/.test(txt), txt);
    await ctx.setOffline(false);
    let st;
    for (let i = 0; i < 20; i++) { st = (await admin.from("addon_purchases").select("status").eq("id", pid).single()).data?.status; if (st === "redeemed") break; await wait(1000); }
    check("after sync the purchase is redeemed", st === "redeemed", st);
    const left = (await admin.from("addons").select("sold, stock_total").eq("id", curry.id).single()).data;
    check("stock: 39 left of 40", left.stock_total - left.sold === 39, JSON.stringify(left));
    await page.screenshot({ path: "screenshots/demo-mode-scan-1440-light.png" });
  } finally { await unpark(); }
} finally {
  await browser?.close();
  await reset();
  await setMode(prior);
}
console.log(failed ? `\n${failed} FAILED` : "\nALL DEMO MODE TESTS PASSED");
process.exit(failed ? 1 : 0);
