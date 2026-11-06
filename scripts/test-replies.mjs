// Admin explains -> replies drafted per complainant -> preview/edit/send all (in progress / resolved / cannot be resolved), and student<->admin messages.
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
const file = (c, body, o = {}) => c.rpc("file_complaint", { p_mess: "ifc-a", p_category: "food_quality", p_date: yesterday, p_slot: "dinner", p_body: body, p_anonymous: false, ...o });
const clean = async () => { await admin.from("complaints").delete().neq("id", NIL); await admin.from("admin_messages").delete().neq("id", 0); };
await clean();
let browser;
try {
  const s1 = await as("student@student.nitw.ac.in"), s2 = await as("student2@student.nitw.ac.in"), parent = await as("parent@example.com"), aA = await as("admin@nitw.ac.in"), aB = await as("admin-ifcb@nitw.ac.in");
  await file(s1, "The dal was cold and the rice was stale at dinner");
  await file(s1, "Dinner dal was cold again, not fresh");
  await file(parent, "Cold stale food served at dinner", { p_anonymous: true });
  const rows = (await aA.rpc("admin_complaints")).data;
  const named = rows.filter((r) => !r.anonymous); // [0] is resolved and deleted below, [1] is used for the "cannot resolve" rule

  // SQL rules for the three outcomes
  check("in progress: allowed with a reply", !(await aA.rpc("respond_complaint", { p_id: named[0].id, p_outcome: "in_progress", p_reply: "We are working on this right now." })).error);
  check("an in-progress complaint can be answered again (resolved)", !(await aA.rpc("respond_complaint", { p_id: named[0].id, p_outcome: "resolved", p_reply: "It is fixed now, thank you." })).error);
  check("a resolved complaint cannot be answered again", !!(await aA.rpc("respond_complaint", { p_id: named[0].id, p_outcome: "in_progress", p_reply: "Trying to reopen this one." })).error);
  check("cannot be resolved without a reason is refused", !!(await aA.rpc("respond_complaint", { p_id: named[1].id, p_outcome: "cannot_resolve", p_reply: "We cannot do this one." })).error);
  await admin.from("complaints").delete().eq("id", named[0].id);

  // browser: note -> draft -> preview -> send all
  browser = await chromium.launch();
  const actx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await actx.addCookies((await sessionCookies("admin@nitw.ac.in")).cookies);
  const ap = await actx.newPage();
  const vis = (l, ms = 10000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
  await ap.goto(`${BASE}/dashboard/admin/complaints`, { waitUntil: "networkidle" });
  await ap.getByTestId("draft-replies").click();
  check("drafting without a note shows a message", await vis(ap.getByText(/Write a note of at least 10 characters/)));
  const NOTE = "The holding oven was faulty and was repaired this afternoon; we now check temperatures every 30 minutes.";
  await ap.getByTestId("issue-note").fill(NOTE);
  await ap.getByTestId("outcome-in_progress").check();
  await ap.getByTestId("draft-replies").click();
  check("replies are drafted (preview shown with a source label)", await vis(ap.getByText(/Written by AI|Written from a template/)));
  const texts = await ap.locator("[data-testid=console-complaint] textarea").evaluateAll((els) => els.map((e) => e.value));
  check("every reply includes the admin's note", texts.length === 2 && texts.every((x) => x.includes("holding oven was faulty")), JSON.stringify(texts));
  check("replies are individual: they quote that student's own complaint (template) or differ", new Set(texts).size === texts.length, JSON.stringify(texts));
  check("anonymous complainant is greeted without a name", texts.some((x) => /^Hello,? /.test(x) && !/Demo/.test(x)));
  await ap.locator("[data-testid=console-complaint] textarea").first().fill(texts[0] + " (edited by the admin)");
  await ap.screenshot({ path: "screenshots/replies-preview-1440-light.png", fullPage: true });
  await ap.getByTestId("send-all").click();
  await ap.waitForTimeout(2500);
  const after = (await admin.from("complaints").select("status, reply")).data;
  check("Send all: every complaint is now 'in progress' with its reply", after.length === 2 && after.every((c) => c.status === "in_progress" && c.reply.includes("holding oven")) && after.some((c) => c.reply.includes("edited by the admin")), JSON.stringify(after));
  const sctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await sctx.addCookies((await sessionCookies("student@student.nitw.ac.in")).cookies);
  const sp = await sctx.newPage();
  await sp.goto(`${BASE}/dashboard/student/complaints`, { waitUntil: "networkidle" });
  check("student sees 'In progress' and the admin's reply", await vis(sp.getByText("In progress").first()) && await vis(sp.getByText(/holding oven/).first()));

  // messages
  check("student sends a message to their mess admin", !(await s1.rpc("send_student_message", { p_body: "Is the dal going to be better tonight?" })).error);
  const inbox = (await aA.rpc("admin_inbox")).data;
  check("IFC-A admin inbox: 1 thread, 1 unread, student named", inbox.length === 1 && inbox[0].unread === 1 && inbox[0].student_name === "Demo Student", JSON.stringify(inbox));
  check("IFC-B admin sees nothing of it", (await aB.rpc("admin_inbox")).data.length === 0 && (await aB.rpc("admin_thread", { p_student: inbox[0].student_id })).data.length === 0);
  check("IFC-B admin cannot reply to it", !!(await aB.rpc("admin_reply_message", { p_student: inbox[0].student_id, p_body: "Hello from the wrong mess" })).error);
  check("another student cannot read the thread", ((await s2.from("admin_messages").select("id")).data ?? []).length === 0);
  check("admin_thread returns it and marks it read", (await aA.rpc("admin_thread", { p_student: inbox[0].student_id })).data.length === 1 && (await aA.rpc("admin_inbox")).data[0].unread === 0);
  check("admin replies", !(await aA.rpc("admin_reply_message", { p_student: inbox[0].student_id, p_body: "Yes, the oven is fixed." })).error);
  check("student has 1 unread reply, then 0 after reading", (await s1.rpc("student_unread_count")).data === 1 && !(await s1.rpc("student_thread_read")).error && (await s1.rpc("student_unread_count")).data === 0);
  check("a parent cannot message the admin", !!(await parent.rpc("send_student_message", { p_body: "Parent trying to message" })).error);

  // UI: floating button (mobile), nav button (desktop), panel, admin inbox page
  await sp.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  check("mobile: floating 'Contact admin' button is visible", await vis(sp.getByTestId("contact-fab")));
  await sp.screenshot({ path: "screenshots/contact-fab-390-light.png" });
  await sp.getByTestId("contact-fab").click();
  check("panel opens with the conversation", await vis(sp.getByText("Yes, the oven is fixed.")));
  await sp.getByTestId("contact-input").fill("Thank you, will check tonight");
  await sp.getByTestId("contact-send").click();
  check("student sends from the panel", await vis(sp.getByTestId("contact-thread").getByText("Thank you, will check tonight")));
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await dctx.addCookies((await sessionCookies("student@student.nitw.ac.in")).cookies);
  const dp = await dctx.newPage();
  await dp.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  check("desktop: 'Contact admin' is in the nav", await vis(dp.getByTestId("contact-nav")));
  check("desktop: the floating button is hidden", !(await dp.getByTestId("contact-fab").isVisible()));
  await actx.pages()[0].goto(`${BASE}/dashboard/admin/messages`, { waitUntil: "networkidle" });
  await ap.getByTestId("thread").first().click();
  check("admin inbox shows the conversation", await vis(ap.getByTestId("admin-thread").getByText("Thank you, will check tonight")));
  await ap.getByTestId("admin-reply-input").fill("See you then");
  await ap.getByTestId("admin-reply-send").click();
  check("admin replies from the inbox", await vis(ap.getByTestId("admin-thread").getByText("See you then")));
  await ap.screenshot({ path: "screenshots/inbox-1440-light.png" });
} finally {
  await browser?.close();
  await clean();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL REPLY + MESSAGE TESTS PASSED");
process.exit(failed ? 1 : 0);
