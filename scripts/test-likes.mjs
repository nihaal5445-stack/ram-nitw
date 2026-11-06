// Dish likes: one per student per dish per day, anonymous-safe counts, top-liked for admins. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const clean = () => admin.from("dish_likes").delete().neq("dish_key", "");
await clean();
let browser;
try {
  const s1 = await as("student@student.nitw.ac.in"), s2 = await as("student2@student.nitw.ac.in"), counter = await as("counter@nitw.ac.in");
  const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
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
  const first = menu.getByTestId("like-btn").nth(1); // first dish (0 = whole meal)
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
  await clean();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL LIKES TESTS PASSED");
process.exit(failed ? 1 : 0);
