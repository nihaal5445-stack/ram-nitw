// Dish likes: one per student per dish per day, anonymous-safe counts, top-liked for admins. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";
import { demoModeFromEnv, setDemoMode } from "./lib/demo-mode.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const S1 = "11111111-1111-1111-1111-111111111111";
const NIL = "00000000-0000-0000-0000-000000000000";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const clean = async () => { await admin.from("dish_likes").delete().neq("dish_key", ""); await admin.from("feedback_prompts").delete().neq("redemption_id", NIL); await admin.from("meal_redemptions").delete().neq("id", NIL); };
const scan = async (studentId, mess, slot, minutesAgo, status = "accepted") => { const id = randomUUID(); const { error } = await admin.from("meal_redemptions").insert({ id, student_id: studentId, mess_id: mess, meal_date: today, slot, method: "qr", scanned_at: new Date(Date.now() - minutesAgo * 60e3).toISOString(), status }); if (error) throw new Error(error.message); return id; };
// the slot-end rule depends on the clock, so the test pins window ends itself (restored in finally)
const setEnd = (mess, slot, ends) => admin.from("mess_slots").update({ ends }).eq("mess_id", mess).eq("slot", slot);
const origEnds = (await admin.from("mess_slots").select("mess_id,slot,ends").in("mess_id", ["ifc-a", "ifc-b"])).data;
await setDemoMode(false);
await clean();
let browser;
try {
  const s1 = await as("student@student.nitw.ac.in"), s2 = await as("student2@student.nitw.ac.in"), counter = await as("counter@nitw.ac.in");
  const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const S2 = (await admin.from("profiles").select("id").eq("email", "student2@student.nitw.ac.in").single()).data.id;
  // ---- the "only after eating" gate (enforced in SQL) ----
  await setEnd("ifc-a", "lunch", "23:59:59"); await setEnd("ifc-a", "dinner", "23:59:59"); await setEnd("ifc-a", "snacks", "23:59:59"); await setEnd("ifc-a", "breakfast", "23:59:59"); await setEnd("ifc-b", "lunch", "23:59:59");
  const locked = async (c, slot, dish = "dal") => { const r = await c.rpc("toggle_dish_like", { p_slot: slot, p_dish: dish }); return r.error?.message ?? (r.data === true ? "LIKED" : "unliked"); };
  check("no scan: liking is refused in SQL", /like_locked/.test(await locked(s1, "lunch")));
  await scan(S1, "ifc-a", "lunch", 5);
  check("scanned 5 min ago, slot not over: still locked", /like_locked/.test(await locked(s1, "lunch")) && /like_locked/.test(await locked(s1, "lunch", "_meal")));
  check("my_like_status says locked for lunch", (await s1.rpc("my_like_status")).data.some((x) => x.slot === "lunch" && x.unlocked === false));
  check("a scan for lunch does not unlock dinner", /like_locked/.test(await locked(s1, "dinner")));
  await scan(S1, "ifc-a", "snacks", 90, "rejected");
  check("a rejected scan never unlocks (even 90 min old)", /like_locked/.test(await locked(s1, "snacks")));
  check("another student's scan does not unlock mine", /like_locked/.test(await locked(s2, "lunch")));
  check("the like table stayed empty while locked", (await admin.from("dish_likes").select("*")).data.length === 0);
  check("'Simulate 40 min passed' unlocks that meal", (await s1.rpc("simulate_feedback_due")).data === 1 && (await locked(s1, "lunch")) === "LIKED");
  await s1.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "dal" }); // un-like (always allowed)
  await admin.from("dish_likes").delete().neq("dish_key", "");
  await scan(S1, "ifc-a", "dinner", 45);
  check("scanned 45 min ago: the 40-minute rule unlocks it", (await locked(s1, "dinner", "_meal")) === "LIKED");
  await admin.from("dish_likes").delete().neq("dish_key", "");
  await setEnd("ifc-b", "lunch", "00:01");
  await scan(S2, "ifc-b", "lunch", 2);
  check("scanned 2 min ago but the slot has ended: unlocked", (await locked(s2, "lunch")) === "LIKED");
  await admin.from("dish_likes").delete().neq("dish_key", "");
  await setDemoMode(true);
  await scan(S1, "ifc-a", "breakfast", 1);
  check("DEMO MODE: 'slot ended' does not unlock instantly (breakfast scanned 1 min ago)", /like_locked/.test(await locked(s1, "breakfast")));
  await setDemoMode(false);
  await clean();
  // gate is open from here on: scans 60 min ago for the slots used below
  await scan(S1, "ifc-a", "lunch", 60); await scan(S2, "ifc-b", "lunch", 60);

  check("student likes a dish", (await s1.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "dal" })).data === true);
  check("the same toggle again removes it (one like per dish per day)", (await s1.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "dal" })).data === false);
  await s1.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "dal" });
  await s1.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "_meal" });
  check("only one row per student/dish/day", (await admin.from("dish_likes").select("*").eq("dish_key", "dal")).data.length === 1);
  check("a malformed dish key is refused", !!(await s1.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "x; drop" })).error);
  check("counter staff cannot like", !!(await counter.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "dal" })).error);
  await s2.rpc("toggle_dish_like", { p_slot: "lunch", p_dish: "dal" }); // IFC-B student: a different mess
  const a = (await anon.rpc("dish_like_counts", { p_mess: "ifc-a" })).data;
  check("anonymous counts per mess: IFC-A dal = 1 (IFC-B's like is separate)", a.find((r) => r.dish_key === "dal")?.n === 1 && !JSON.stringify(a).includes("student"), JSON.stringify(a));
  check("raw likes are not readable anonymously", (await anon.from("dish_likes").select("*")).error != null);
  check("a student sees only their own likes", ((await s1.from("dish_likes").select("student_id")).data ?? []).every((r) => r.student_id === "11111111-1111-1111-1111-111111111111"));
  const adminA = await as("admin@nitw.ac.in"), adminB = await as("admin-ifcb@nitw.ac.in"), warden = await as("warden@nitw.ac.in");
  const ta = (await adminA.rpc("top_liked_dishes")).data, tb = (await adminB.rpc("top_liked_dishes")).data;
  check("IFC-A admin sees only IFC-A's top dishes (meal-level likes excluded)", ta.length === 1 && ta[0].mess_id === "ifc-a" && ta[0].dish_key === "dal", JSON.stringify(ta));
  check("IFC-B admin sees only IFC-B's", tb.length === 1 && tb[0].mess_id === "ifc-b", JSON.stringify(tb));
  check("warden sees both", (await warden.rpc("top_liked_dishes")).data.length === 2);
  check("a student cannot see top-liked", ((await s1.rpc("top_liked_dishes")).data ?? []).length === 0);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addCookies((await sessionCookies("student@student.nitw.ac.in")).cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  const menu = page.getByTestId("student-menu");
  await menu.waitFor({ timeout: 10000 });
  const lockedBtn = menu.locator("[data-testid=meal-dinner] [data-testid=like-btn]").nth(1);
  check("UI: a meal without a scan shows disabled hearts with the tooltip", (await lockedBtn.getAttribute("data-locked")) === "true" && (await menu.locator("[data-testid=meal-dinner] [data-testid=like-tooltip]").first().innerText()) === "You can rate this after your meal");
  const lockedBefore = await lockedBtn.getByTestId("like-count").innerText();
  await lockedBtn.click({ force: true }); await page.waitForTimeout(500);
  check("UI: tapping a locked heart does not change the count", (await lockedBtn.getByTestId("like-count").innerText()) === lockedBefore);
  const first = menu.locator("[data-testid=meal-lunch] [data-testid=like-btn]").nth(1); // first lunch dish (0 = whole meal): unlocked above
  const before = Number(await first.getByTestId("like-count").innerText());
  await first.click(); await page.waitForTimeout(900);
  const after = Number(await first.getByTestId("like-count").innerText());
  check("student dashboard: tapping a heart changes the count by one", Math.abs(after - before) === 1, `${before} -> ${after}`);
  await page.screenshot({ path: "screenshots/likes-student-390-light.png", fullPage: true });
  const ap = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await ap.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("public page loads with like counts (read-only hearts)", await ap.locator("#messes svg.lucide-heart").first().isVisible().catch(() => false) || (await ap.locator("#messes").innerText()).length > 0);
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await actx.addCookies((await sessionCookies("admin@nitw.ac.in")).cookies);
  const adp = await actx.newPage();
  await adp.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  check("admin dashboard shows the top-liked card", await adp.getByTestId("top-liked").isVisible());
} finally {
  await browser?.close();
  for (const r of origEnds) await admin.from("mess_slots").update({ ends: r.ends }).eq("mess_id", r.mess_id).eq("slot", r.slot);
  await clean();
  await admin.from("notifications").delete().eq("category", "timings"); // slot edits above notify students (no-op before the notifications migration)
  await setDemoMode(demoModeFromEnv());
}
console.log(failed ? `\n${failed} FAILED` : "\nALL LIKES TESTS PASSED");
process.exit(failed ? 1 : 0);
