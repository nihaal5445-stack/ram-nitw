// Grievance flow: filing, privacy, grouping, replies, decline-needs-reason, SLA, public progress. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";
import { groupComplaints } from "../src/lib/complaints/group.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
// yesterday, so the dinner window is always closed and the SLA timer is running (or overdue) whatever time the test runs
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - 86_400_000));
const file = (c, body, o = {}) => c.rpc("file_complaint", { p_mess: "ifc-a", p_category: "food_quality", p_date: today, p_slot: "dinner", p_body: body, p_anonymous: false, ...o });
const clean = () => admin.from("complaints").delete().neq("id", NIL);
await clean();
let browser;
try {
  const student = await as("student@student.nitw.ac.in"), parent = await as("parent@example.com"), counter = await as("counter@nitw.ac.in"), mAdmin = await as("admin@nitw.ac.in");

  check("student files a complaint", !(await file(student, "The dal was cold and the rice was stale at dinner")).error);
  check("student files a second similar one", !(await file(student, "Dinner dal was cold again, not fresh")).error);
  check("parent files an ANONYMOUS similar complaint", !(await file(parent, "Cold stale food served at dinner", { p_anonymous: true })).error);
  check("student files a different issue (hair)", !(await file(student, "Found a hair in my chapati at dinner", { p_category: "hygiene" })).error);
  check("a 10-char minimum on the text is enforced", !!(await file(student, "short")).error);
  check("future dates are refused", !!(await file(student, "Something about tomorrow's lunch", { p_date: "2999-01-01" })).error);
  check("counter staff cannot file", !!(await file(counter, "Counter staff complaint attempt here")).error);

  check("student sees only their own complaints (3)", (await student.from("complaints").select("id")).data.length === 3);
  check("parent sees only their own complaint (1)", (await parent.from("complaints").select("id")).data.length === 1);
  check("counter staff sees none", (await counter.from("complaints").select("id")).data.length === 0 && (await counter.rpc("admin_complaints")).data.length === 0);
  check("student cannot call the admin view", (await student.rpc("admin_complaints")).data.length === 0);

  const rows = (await mAdmin.rpc("admin_complaints")).data;
  check("mess admin sees all 4", rows.length === 4, rows.length);
  const anon = rows.find((r) => r.anonymous);
  check("anonymous complaint hides the filer from the admin", anon && anon.filer_name === null && !JSON.stringify(anon).includes(parent.auth ? "parent@" : "x"));
  check("named complaint shows the filer", rows.some((r) => !r.anonymous && r.filer_name));
  const issues = groupComplaints(rows, (id) => id);
  check("grouping: 3 'cold/stale' complaints become one issue; hair is separate", issues.length === 2 && issues[0].complaints.length === 3 && /cold or stale/.test(issues[0].topicLabel), JSON.stringify(issues.map((i) => [i.topic, i.complaints.length])));
  check("summary mentions the count; anonymous draft has no name", /3 reports/.test(issues[0].summary) && Object.values(issues[0].drafts).some((d) => d.startsWith("Hello,")));
  check("SLA deadline = dinner end 21:30 + 30 min (22:00 IST)", new Date(rows[0].sla_due).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) === "22:00", rows[0].sla_due);

  const cold = rows.filter((r) => /cold|Cold/.test(r.body));
  const hair = rows.find((r) => /hair/.test(r.body));
  check("declining without a reason is refused", !!(await mAdmin.rpc("respond_complaint", { p_id: hair.id, p_outcome: "cannot_resolve", p_reply: "We cannot act on this one" })).error);
  check("declining with a reason works", !(await mAdmin.rpc("respond_complaint", { p_id: hair.id, p_outcome: "cannot_resolve", p_reply: "We checked the CCTV and records.", p_reason: "Could not identify the batch or the counter." })).error);
  check("answering twice is refused", !!(await mAdmin.rpc("respond_complaint", { p_id: hair.id, p_outcome: "resolved", p_reply: "Second answer attempt here" })).error);
  check("a student cannot answer complaints", !!(await student.rpc("respond_complaint", { p_id: cold[0].id, p_outcome: "resolved", p_reply: "I resolve my own complaint" })).error);
  check("a declined complaint cannot be posted to the public board", !!(await mAdmin.rpc("post_complaint_progress", { p_id: hair.id, p_text: "Hair issue was fixed everywhere" })).error);
  check("student sees the decline reason on their complaint", (await student.from("complaints").select("cannot_reason, status").eq("id", hair.id).single()).data.cannot_reason?.includes("Could not identify"));

  // browser: admin console, answer one, student timeline, public board
  browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctxA.addCookies((await sessionCookies("admin@nitw.ac.in")).cookies);
  const ap = await ctxA.newPage();
  await ap.goto(`${BASE}/dashboard/admin/complaints`, { waitUntil: "networkidle" });
  const vis = (l) => l.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
  check("console shows the grouped issue with '3 reports'", await vis(ap.getByText("3 reports", { exact: true })));
  check("console shows an SLA timer", await vis(ap.getByRole("timer").first()));
  check("console labels the summary source honestly", await vis(ap.getByText(/Auto summary \(keyword rules\)|AI summary/)));
  await ap.screenshot({ path: "screenshots/complaints-admin-1440-light.png", fullPage: true });
  await ap.getByTestId("send-resolved").first().click();
  await ap.waitForTimeout(1500);
  const resolvedId = (await admin.from("complaints").select("id, filer_id").eq("status", "resolved")).data;
  check("sending a reply resolves exactly that complaint", resolvedId.length === 1, resolvedId.length);
  await ap.reload({ waitUntil: "networkidle" });
  await ap.getByTestId("post-progress").first().click();
  await ap.waitForTimeout(1500);
  const pub = await (await fetch(`${BASE}/`)).text();
  check("resolved item posted to the public Daily Progress board", pub.includes("Resolved: complaint about"), "not found in /");
  check("public board never shows the complaint text of a declined item", !pub.includes("hair in my chapati"));
  const anonRpc = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  check("anonymous visitors cannot read complaints", (await anonRpc.from("complaints").select("id")).error != null);

  const ctxS = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctxS.addCookies((await sessionCookies("student@student.nitw.ac.in")).cookies);
  const sp = await ctxS.newPage();
  await sp.goto(`${BASE}/dashboard/student/complaints`, { waitUntil: "networkidle" });
  check("student page: shows 'Cannot be resolved' with the reason", await vis(sp.getByText("Cannot be resolved").first()) && await vis(sp.getByText(/Could not identify the batch/)));
  check("student page: a reply from the administration is shown", await vis(sp.getByText("Reply from the mess administration").first()));
  await sp.screenshot({ path: "screenshots/complaints-student-390-light.png", fullPage: true });
} finally {
  await browser?.close();
  await clean();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL COMPLAINT TESTS PASSED");
process.exit(failed ? 1 : 0);
