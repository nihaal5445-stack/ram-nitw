// Browser test: sign in with the 6-digit code (works across devices) and the proxy/cookie plumbing.
// Needs: supabase running, `next start -p 3100`. Uses GoTrue's admin generateLink to obtain a valid code without
// reading email (the email template only matters for delivery; it takes effect after a Supabase restart).
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };

const visible = (loc, ms = 8000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const browser = await chromium.launch();
async function signInWithCode(email, tab, expectPath) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login?role=${tab}`, { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await page.getByLabel("Or enter the 6-digit code from the email").waitFor({ timeout: 10000 });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); // replaces the pending code with a known one
  if (error) throw new Error(error.message);
  const otp = data.properties.email_otp;
  return { page, otp, expectPath, email };
}

// 1. student, correct code -> lands on the student dashboard
{
  const s = await signInWithCode("student@student.nitw.ac.in", "students");
  await s.page.getByLabel("Or enter the 6-digit code from the email").fill("000000");
  await s.page.getByRole("button", { name: "Sign in with code" }).click();
  check("wrong code shows an error and does not sign in", await visible(s.page.getByText("That code did not work.")));
  await s.page.getByLabel("Or enter the 6-digit code from the email").fill(s.otp);
  await s.page.getByRole("button", { name: "Sign in with code" }).click();
  await s.page.waitForURL("**/dashboard/student", { timeout: 15000 }).catch(() => {});
  check("correct code signs the student in and lands on /dashboard/student", s.page.url().endsWith("/dashboard/student"), s.page.url());
  check("session cookie uses the explicit name sb-ram-auth-token", (await s.page.context().cookies()).some((c) => c.name.startsWith("sb-ram-auth-token")));
  check("server renders the signed-in dashboard (cookie readable by SSR)", await s.page.getByText("Demo Student").first().isVisible());
}
// 2. warden (staff tab) -> warden dashboard
{
  const w = await signInWithCode("warden@nitw.ac.in", "staff");
  await w.page.getByLabel("Or enter the 6-digit code from the email").fill(w.otp);
  await w.page.getByRole("button", { name: "Sign in with code" }).click();
  await w.page.waitForURL("**/dashboard/warden", { timeout: 15000 }).catch(() => {});
  check("code sign-in routes a warden to /dashboard/warden", w.page.url().endsWith("/dashboard/warden"), w.page.url());
}
// 3. an unregistered parent email never reaches the code step
{
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login?role=parents`, { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill("stranger@example.com");
  await page.getByRole("button", { name: "Send magic link" }).click();
  check("unregistered parent email: friendly error, no code box", await visible(page.getByText(/not registered/)) && !(await page.getByLabel("Or enter the 6-digit code from the email").isVisible()));
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL LOGIN CODE TESTS PASSED");
process.exit(failed ? 1 : 0);
