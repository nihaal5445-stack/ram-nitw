// Live dashboards: an accepted scan (inserted as the sync route would) updates the admin head count and crowd panel with NO reload,
// via the Realtime broadcast; a rejected scan does not. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const S2 = "77777777-7777-7777-7777-777777777777";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const scan = (status, slot) => admin.from("meal_redemptions").insert({ id: randomUUID(), student_id: S2, mess_id: "ifc-b", meal_date: today, slot, method: "qr", scanned_at: new Date().toISOString(), status, ...(status === "rejected" ? { reject_reason: "stale_code" } : {}) });
await admin.from("meal_redemptions").delete().neq("id", NIL);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies((await sessionCookies("admin-ifcb@nitw.ac.in")).cookies);
  const page = await ctx.newPage();
  let navs = 0; page.on("framenavigated", () => navs++);
  await page.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  const el = page.getByTestId("live-count");
  const n = async () => Number(await el.getAttribute("data-count"));
  check("admin head count is real (0 after a clean slate), not a fixed number", (await n()) === 0, await n());
  await wait(2500); navs = 0;
  await scan("rejected", "lunch"); await wait(2500);
  check("a REJECTED scan does not change the head count", (await n()) === 0);
  const t0 = Date.now();
  await scan("accepted", "lunch");
  for (let i = 0; i < 40 && (await n()) === 0; i++) await wait(150);
  check("an ACCEPTED scan raises the head count to 1 within 3 s, live", (await n()) === 1 && Date.now() - t0 < 3000, `${await n()} after ${Date.now() - t0} ms`);
  await scan("accepted", "dinner");
  for (let i = 0; i < 40 && (await n()) < 2; i++) await wait(150);
  check("a second accepted scan: 2", (await n()) === 2);
  check("no page reload happened", navs === 0, navs);
} finally {
  await browser?.close();
  await admin.from("meal_redemptions").delete().neq("id", NIL);
}
console.log(failed ? `\n${failed} FAILED` : "\nALL LIVE TESTS PASSED");
process.exit(failed ? 1 : 0);
