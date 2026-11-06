// Post-meal feedback: 40-minute rule, snooze/skip settings, privacy, UI banner + bell. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const S1 = "11111111-1111-1111-1111-111111111111";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const scan = async (slot, minutesAgo) => { const id = randomUUID(); const { error } = await admin.from("meal_redemptions").insert({ id, student_id: S1, mess_id: "ifc-a", meal_date: today, slot, method: "qr", scanned_at: new Date(Date.now() - minutesAgo * 60e3).toISOString(), status: "accepted" }); if (error) throw new Error(error.message); return id; };
const clean = async () => { await admin.from("feedback_prompts").delete().neq("redemption_id", NIL); await admin.from("feedback_prefs").delete().neq("student_id", NIL); await admin.from("meal_redemptions").delete().neq("id", NIL); };
await clean();
let browser;
try {
  const student = await as("student@student.nitw.ac.in"), counter = await as("counter@nitw.ac.in"), parent = await as("parent@example.com"), mAdmin = await as("admin@nitw.ac.in");
  const due = async (c = student) => (await c.rpc("my_feedback_prompts")).data ?? [];

  const lunch = await scan("lunch", 5);
  check("5 minutes after the scan: no prompt yet", (await due()).length === 0);
  check("simulate 40 min: the prompt is due", (await student.rpc("simulate_feedback_due")).data === 1 && (await due()).length === 1);
  check("a counter or a parent never gets someone else's prompt", (await due(counter)).length === 0 && (await due(parent)).length === 0);

  await student.rpc("set_feedback_prefs", { p_skippable: false, p_remind_once: true });
  check("'skippable' off: skipping is refused", !!(await student.rpc("skip_feedback", { p_redemption: lunch })).error);
  await student.rpc("set_feedback_prefs", { p_skippable: true, p_remind_once: true });
  check("'remind once': first skip snoozes (prompt hidden)", (await student.rpc("skip_feedback", { p_redemption: lunch })).data === "snoozed" && (await due()).length === 0);
  await student.rpc("simulate_feedback_due");
  check("after the snooze it is due again", (await due()).length === 1);
  check("second skip is final", (await student.rpc("skip_feedback", { p_redemption: lunch })).data === "skipped" && (await due()).length === 0);

  const dinner = await scan("dinner", 50);
  check("a scan 50 min old is due without any simulation", (await due()).some((p) => p.redemption_id === dinner));
  check("0 and 6 stars are refused", !!(await student.rpc("submit_feedback", { p_redemption: dinner, p_stars: 0, p_review: "", p_improve: "" })).error && !!(await student.rpc("submit_feedback", { p_redemption: dinner, p_stars: 6, p_review: "", p_improve: "" })).error);
  check("someone else cannot answer my prompt", !!(await parent.rpc("submit_feedback", { p_redemption: dinner, p_stars: 5, p_review: "", p_improve: "" })).error);
  check("student submits 4 stars with text", !(await student.rpc("submit_feedback", { p_redemption: dinner, p_stars: 4, p_review: "Good dal", p_improve: "More salad" })).error);
  check("answering twice is refused", !!(await student.rpc("submit_feedback", { p_redemption: dinner, p_stars: 1, p_review: "", p_improve: "" })).error);
  check("staff cannot read the raw prompts table", ((await counter.from("feedback_prompts").select("*")).data ?? []).length === 0 && ((await mAdmin.from("feedback_prompts").select("*")).data ?? []).length === 0);
  const sum = (await mAdmin.rpc("mess_feedback_summary")).data;
  check("mess admin sees only an aggregate (no student ids)", sum.length === 1 && sum[0].n === 1 && Number(sum[0].avg_stars) === 4 && !("student_id" in sum[0]), JSON.stringify(sum));
  check("a student cannot read the aggregate of others", (await student.rpc("mess_feedback_summary")).data.length === 0);

  // UI
  await scan("breakfast", 3);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies((await sessionCookies("student@student.nitw.ac.in")).cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  check("no banner before the 40 minutes", !(await page.getByTestId("feedback-banner").isVisible()));
  await page.goto(`${BASE}/dashboard/student/feedback`, { waitUntil: "networkidle" });
  await page.getByTestId("simulate-40").click();
  await page.getByTestId("feedback-card").waitFor({ timeout: 8000 });
  check("after 'Simulate 40 min passed' a feedback card appears", true);
  await page.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  const vis = (l) => l.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
  check("banner is shown on the dashboard", await vis(page.getByTestId("feedback-banner")));
  check("bell shows a count of 1", (await page.getByTestId("feedback-count").innerText()) === "1");
  await page.screenshot({ path: "screenshots/feedback-banner-390-light.png" });
  await page.getByTestId("feedback-bell").click();
  await page.getByRole("radio", { name: "5 stars" }).click();
  await page.getByLabel("Your review (optional)").fill("Idli was soft");
  await page.getByTestId("submit-feedback").click();
  check("sending shows thanks", await vis(page.getByText("Thank you! Your feedback was sent.")));
  const row = (await admin.from("feedback_prompts").select("stars, review, status").eq("slot", "breakfast").single()).data;
  check("stored: 5 stars, review, submitted", row.stars === 5 && row.review === "Idli was soft" && row.status === "submitted", JSON.stringify(row));
  await page.screenshot({ path: "screenshots/feedback-done-390-light.png" });
} finally {
  await browser?.close();
  await clean();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL FEEDBACK TESTS PASSED");
process.exit(failed ? 1 : 0);
