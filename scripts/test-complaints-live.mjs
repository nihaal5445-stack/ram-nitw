// Complaints reach the right admin LIVE (Realtime): student2 (IFC-B) -> admin-ifcb, student (IFC-A) -> admin@. Real browser contexts. Needs `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await admin.from("complaints").delete().neq("id", NIL);
let browser;
try {
  browser = await chromium.launch();
  const open = async (email, w = 1280) => { const c = await browser.newContext({ viewport: { width: w, height: 1000 } }); await c.addCookies((await sessionCookies(email)).cookies); return c.newPage(); };
  const file = async (p, body) => { await p.goto(`${BASE}/dashboard/student/complaints`, { waitUntil: "networkidle" }); await p.locator("#c-body").fill(body); await p.getByRole("button", { name: "Submit complaint" }).click(); await p.getByText("Complaint filed.").waitFor({ timeout: 8000 }); };
  const issues = (p) => p.getByTestId("issue").count();
  const waitFor = async (fn, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await wait(150); } return -1; };

  const adminB = await open("admin-ifcb@nitw.ac.in"), adminA = await open("admin@nitw.ac.in");
  const stu2 = await open("student2@student.nitw.ac.in", 390), stu1 = await open("student@student.nitw.ac.in", 390);
  await adminB.goto(`${BASE}/dashboard/admin/complaints`, { waitUntil: "networkidle" });
  await adminA.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  check("IFC-B admin console starts empty and says it shows IFC-B only", (await issues(adminB)) === 0 && /IFC-B only/.test(await adminB.getByTestId("console-scope").innerText()));
  await wait(2500); // sockets subscribed

  // student2 (IFC-B) files: the form is addressed to IFC-B
  await stu2.goto(`${BASE}/dashboard/student/complaints`, { waitUntil: "networkidle" });
  check("student2's form defaults to IFC-B and says who receives it", (await stu2.locator("#c-mess").inputValue()) === "ifc-b" && /admin of IFC-B/.test(await stu2.getByTestId("goes-to").innerText()));
  await file(stu2, "The dal was cold and the rice stale at lunch (student2)");
  const ms = await waitFor(async () => (await issues(adminB)) === 1);
  check("IFC-B admin console shows it LIVE without a reload (Realtime; 8 s poll as fallback)", ms >= 0, `${ms} ms`);
  check("...with a 'New complaint' toast", await adminB.getByTestId("complaint-toast").isVisible());
  check("IFC-A admin (other mess) gets no toast and no badge", !(await adminA.getByTestId("complaint-toast").isVisible()) && (await adminA.getByTestId("complaints-unseen").count()) === 0);

  // the IFC-B admin is on the console: it is marked seen, so no badge
  await wait(1200);
  check("while on the console nothing stays unread (no badge)", (await adminB.getByTestId("complaints-unseen").count()) === 0);
  // admin leaves the console; another complaint -> badge
  await adminB.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  await wait(2000);
  await file(stu2, "Hair found in the chapati at dinner time (student2)");
  const b = await waitFor(async () => (await adminB.getByTestId("complaints-unseen").count()) === 1 && (await adminB.getByTestId("complaints-unseen").innerText()) === "1");
  check("admin on another page: unread badge shows 1 and a toast appears", b >= 0 && await adminB.getByTestId("complaint-toast").isVisible(), `${b} ms`);
  await adminB.screenshot({ path: "screenshots/complaint-toast-1280.png" });
  await adminB.getByTestId("complaints-nav").click();
  await adminB.waitForURL("**/dashboard/admin/complaints");
  check("opening the console shows both complaints", (await waitFor(async () => (await adminB.getByTestId("console-complaint").count()) === 2)) >= 0);
  check("...and clears the badge", (await waitFor(async () => (await adminB.getByTestId("complaints-unseen").count()) === 0)) >= 0);

  // student (IFC-A) -> admin@
  await file(stu1, "Dinner dal was cold again, not fresh (student)");
  await adminA.goto(`${BASE}/dashboard/admin/complaints`, { waitUntil: "networkidle" });
  check("IFC-A admin (admin@nitw.ac.in) sees the IFC-A student's complaint, and not IFC-B's", (await adminA.getByTestId("console-complaint").count()) === 1 && !/student2/.test(await adminA.locator("main").innerText()));
  await adminB.reload({ waitUntil: "networkidle" });
  check("IFC-B admin still sees only IFC-B's two", (await adminB.getByTestId("console-complaint").count()) === 2);
} finally {
  await browser?.close();
  await admin.from("complaints").delete().neq("id", NIL);
}
console.log(failed ? `\n${failed} FAILED` : "\nALL LIVE COMPLAINT TESTS PASSED");
process.exit(failed ? 1 : 0);
