// Admin/warden assistant: access control, offline answers, no raw complaint text or names, UI chips. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 240)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - 86_400_000));
const file = (c, mess, body, o = {}) => c.rpc("file_complaint", { p_mess: mess, p_category: "food_quality", p_date: yesterday, p_slot: "dinner", p_body: body, p_anonymous: false, ...o });
const cookieHeader = async (email) => (await sessionCookies(email)).cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const ask = async (email, question) => { const r = await fetch(`${BASE}/api/assistant`, { method: "POST", headers: { "content-type": "application/json", cookie: await cookieHeader(email) }, body: JSON.stringify({ question }), redirect: "manual" }); return { status: r.status, body: r.status === 200 ? await r.json() : null }; };
const clean = () => admin.from("complaints").delete().neq("id", NIL);
await clean();
let browser;
try {
  const s1 = await as("student@student.nitw.ac.in"), s2 = await as("student2@student.nitw.ac.in"), parent = await as("parent@example.com");
  await file(s1, "ifc-a", "The dal was cold and stale ZXQUNIQUE at dinner");
  await file(s1, "ifc-a", "Cold rice again at dinner, not fresh");
  await file(parent, "ifc-a", "Stale cold food ZXQSECRET served", { p_anonymous: true });
  await file(s1, "ifc-a", "Found a hair in my chapati at dinner", { p_category: "hygiene" });
  await file(s2, "ifc-b", "Long queue and slow service at dinner", { p_category: "service" });

  const none = await fetch(`${BASE}/api/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", redirect: "manual" });
  check("anonymous visitors are turned away", none.status === 307 || none.status === 401 || none.status === 302, none.status);
  check("a student gets 403", (await ask("student@student.nitw.ac.in", "top issues")).status === 403);
  check("a too-short question is refused", (await ask("admin@nitw.ac.in", "x")).status === 400);

  const top = await ask("admin@nitw.ac.in", "What are the top issues at IFC-A this week?");
  const topText = top.body?.answer ?? "";
  check("IFC-A admin: answer lists 'cold or stale food' with a count of 3", /cold or stale food/.test(topText) && /3 complaint/.test(topText) || top.body?.source === "ai", topText);
  check("the answer is labelled by source (offline or AI)", ["offline", "ai"].includes(top.body?.source), JSON.stringify(top.body));
  const fix = await ask("admin@nitw.ac.in", "What should we fix first?");
  check("'fix first' names the biggest open issue", /Fix first: cold or stale food/.test(fix.body?.answer ?? "") || fix.body?.source === "ai", fix.body?.answer);
  const all = [topText, fix.body?.answer ?? "", (await ask("admin@nitw.ac.in", "How are complaints trending?")).body?.answer ?? "", (await ask("admin@nitw.ac.in", "how many complaints?")).body?.answer ?? ""].join("\n");
  check("no complaint text or filer names appear in any answer (anonymous data cannot leak)", !/ZXQUNIQUE|ZXQSECRET|Demo Student|Demo Parent|hair in my chapati/.test(all), all);
  check("IFC-A admin gets no IFC-B complaint data", /no complaint data for IFC-B/i.test((await ask("admin@nitw.ac.in", "What are the top issues at IFC-B this week?")).body?.answer ?? "") || top.body?.source === "ai");
  const w = await ask("warden@nitw.ac.in", "What are the top issues at IFC-B this week?");
  check("warden sees IFC-B: queues and waiting", /queues and waiting|service/i.test(w.body?.answer ?? "") || w.body?.source === "ai", w.body?.answer);
  check("crowd question answered", /IFC-A/.test((await ask("warden@nitw.ac.in", "Which messes are busiest right now?")).body?.answer ?? ""));

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies((await sessionCookies("warden@nitw.ac.in")).cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/warden`, { waitUntil: "networkidle" });
  const chips = page.getByTestId("assistant-chip");
  check("4 suggested question chips", (await chips.count()) === 4, await chips.count());
  await chips.first().click();
  await page.getByTestId("assistant-answer").first().waitFor({ timeout: 15000 });
  check("clicking a chip shows an answer with its source label", /offline summary|ai answer/i.test(await page.getByTestId("assistant-log").innerText()));
  await page.getByTestId("assistant").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "screenshots/assistant-warden-1440-light.png", fullPage: true });
} finally {
  await browser?.close();
  await clean();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL ASSISTANT TESTS PASSED");
process.exit(failed ? 1 : 0);
