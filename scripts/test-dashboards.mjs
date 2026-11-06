// Browser test of the Phase 3 dashboards (warden fraud page, counter and student dashboards) with real data.
// Needs: supabase running, `next start -p 3100`. Run `npm run test:access` first to generate genuine fraud flags.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const S1 = "11111111-1111-1111-1111-111111111111";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
mkdirSync("screenshots", { recursive: true });
const visible = (loc, ms = 8000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

const flagsBefore = (await admin.from("fraud_flags").select("id, resolved_at").is("resolved_at", null)).data.length;
check("precondition: there are open fraud flags (run test:access first)", flagsBefore > 0, flagsBefore);

// today's real rows for the counter and student dashboards
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const { data: sc } = await admin.from("scanner_devices").select("id").limit(1).single();
const mk = (slot, method) => ({ id: crypto.randomUUID(), student_id: S1, mess_id: "ifc-a", meal_date: today, slot, method, scanned_at: new Date().toISOString(), scanner_id: sc?.id ?? null, status: "accepted" });
const mine = [mk("breakfast", "qr"), mk("lunch", "manual")];
await admin.from("meal_redemptions").delete().eq("meal_date", today).eq("student_id", S1);
const ins = await admin.from("meal_redemptions").insert(mine);
check("test rows for today inserted", !ins.error, ins.error?.message);

const browser = await chromium.launch();
const as = async (email, viewport = { width: 1440, height: 900 }, scheme = "light") => {
  const { cookies } = await sessionCookies(email);
  const ctx = await browser.newContext({ viewport, colorScheme: scheme }); await ctx.addCookies(cookies); return ctx.newPage();
};

// ── warden ──
const w = await as("warden@nitw.ac.in");
await w.goto(`${BASE}/dashboard/warden`, { waitUntil: "networkidle" });
check("warden dashboard links to the fraud page with the open count", await visible(w.getByRole("link", { name: new RegExp(`Fraud flags \\(${flagsBefore} open\\)`) })), await w.locator("main").innerText());
await w.goto(`${BASE}/dashboard/warden/fraud`, { waitUntil: "networkidle" });
const items = w.getByTestId("fraud-list").locator("> li");
check("fraud page lists every open flag", (await items.count()) === flagsBefore, `${await items.count()} vs ${flagsBefore}`);
const text = await w.getByTestId("fraud-list").innerText();
for (const label of ["Old code or screenshot", "Forged or corrupted code", "Scan at the wrong mess"]) check(`shows "${label}" with an explanation`, text.includes(label));
check("high-severity flags are labelled", /High/.test(text));
await w.screenshot({ path: "screenshots/warden-fraud-1440-light.png", fullPage: true });
const first = items.first();
await first.getByPlaceholder("What did you find? (required)").fill("Checked with the counter staff: honest mistake");
await first.getByRole("button", { name: "Resolve" }).click();
await w.waitForFunction((n) => document.querySelectorAll("[data-testid=fraud-list] > li").length === n - 1, flagsBefore, { timeout: 10000 }).catch(() => {});
check("resolving removes the flag from the open list", (await items.count()) === flagsBefore - 1);
const resolved = (await admin.from("fraud_flags").select("note, resolved_by").not("resolved_at", "is", null)).data;
check("resolution (note + warden id) is stored", resolved.some((r) => r.note?.includes("honest mistake") && r.resolved_by));
await w.goto(`${BASE}/dashboard/warden/fraud?all=1`, { waitUntil: "networkidle" });
check("'show resolved' reveals the resolved flag with its note", await visible(w.getByText(/Resolved: Checked with the counter staff/)));

// ── access control ──
const c = await as("counter@nitw.ac.in");
await c.goto(`${BASE}/dashboard/warden/fraud`, { waitUntil: "networkidle" });
check("counter staff cannot open the fraud page: told who they are signed in as (no silent redirect)", await visible(c.getByTestId("wrong-role")) && /signed in as Counter/i.test(await c.getByTestId("wrong-role").innerText()), c.url());
const s = await as("student@student.nitw.ac.in", { width: 390, height: 844 }, "dark");
await s.goto(`${BASE}/dashboard/warden/fraud`, { waitUntil: "networkidle" });
check("student cannot open the fraud page (shows the wrong-role notice with Sign out)", await visible(s.getByTestId("wrong-role")) && await visible(s.getByRole("button", { name: "Sign out" }).last()), s.url());
// same browser session switched to admin: the student complaint form is NOT silently replaced by an admin page
const a = await as("admin@nitw.ac.in");
await a.goto(`${BASE}/dashboard/student/complaints`, { waitUntil: "networkidle" });
check("admin opening the student complaint form sees the wrong-role notice, URL unchanged", await visible(a.getByTestId("wrong-role")) && a.url().includes("/dashboard/student/complaints"), a.url());
const sd = await as("student@student.nitw.ac.in");
await sd.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
const hrefs = await sd.locator("a[href^='/dashboard']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
check("student dashboard: complaint link goes to the student form and no link points to an admin/warden/counter route", hrefs.includes("/dashboard/student/complaints") && hrefs.every((h) => !/\/dashboard\/(admin|warden|counter|rep|parent)/.test(h)), JSON.stringify(hrefs));
const noFlagsForStudent = await (await browser.newContext()).request.get(`${BASE}/dashboard/warden/fraud`, { maxRedirects: 0 });
check("anonymous request is redirected to login", [301, 302, 303, 307, 308].includes(noFlagsForStudent.status()), noFlagsForStudent.status());

// ── counter dashboard: real numbers, no fake data ──
await c.goto(`${BASE}/dashboard/counter`, { waitUntil: "networkidle" });
const ctext = await c.locator("main").innerText();
check("counter dashboard shows 2 meals served today and 1 manual entry (real data)", /Meals served today\s*\n?\s*2/.test(ctext) && /Manual entries today\s*\n?\s*1/.test(ctext), ctext.slice(0, 300));
check("the old fake numbers are gone (342, 1.2s, 21BCS001)", !/342|1\.2s|21BCS001/.test(ctext));
check("scanner link is enabled", await c.getByRole("link", { name: /Open scanner/ }).isVisible());
await c.screenshot({ path: "screenshots/counter-dashboard-1440-light.png", fullPage: true });

// ── student dashboard ──
await s.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
const stext = await s.locator("main").innerText();
check("student dashboard: today's meals 2 / 4, real history incl. a Manual entry tag", /2 \/ 4/.test(stext) && /Manual entry/.test(stext) && !/Live meal history available/.test(stext), stext.slice(0, 400));
await s.screenshot({ path: "screenshots/student-dashboard-390-dark.png", fullPage: true });

await admin.from("meal_redemptions").delete().in("id", mine.map((m) => m.id));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL DASHBOARD TESTS PASSED");
process.exit(failed ? 1 : 0);
