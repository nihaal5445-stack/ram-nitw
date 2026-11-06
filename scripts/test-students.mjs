// Add / remove / move students in real browsers (admin-ifcb, admin@, warden). SQL/RLS rules are in supabase/tests/mess_students_test.sql. Needs `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 220)}`); if (!ok) failed++; };
const vis = (l, ms = 10000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const ts = String(Date.now()).slice(-7);
const email = `e2e.${ts}@student.nitw.ac.in`, roll = `E2E${ts}`;
const created = [];
let browser;
try {
  browser = await chromium.launch();
  const open = async (who, w = 1440) => { const c = await browser.newContext({ viewport: { width: w, height: 1100 } }); await c.addCookies((await sessionCookies(who)).cookies); return c.newPage(); };
  const adminB = await open("admin-ifcb@nitw.ac.in");
  await adminB.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  const form = adminB.getByTestId("admin-add-student");
  check("admin dashboard has the 'Add student' form (no mess picker: their own mess only)", await vis(form.getByRole("heading", { name: "Add student" })) && (await form.locator("#st-mess").count()) === 0);

  const fill = async (p, e, n, r) => { await p.locator("#st-email").fill(e); await p.locator("#st-name").fill(n); await p.locator("#st-roll").fill(r); await p.getByTestId("add-student-submit").click(); };
  await fill(adminB, "someone@gmail.com", "Not A Student", "E2EBAD01");
  check("a non-student email is refused with a clear message", /@student\.nitw\.ac\.in/.test(await adminB.getByTestId("add-student-msg").innerText()));
  await fill(adminB, `dup.${ts}@student.nitw.ac.in`, "Dup Roll", "DEMO0001");
  check("a roll number already in use is refused", await vis(adminB.getByText(/roll number is already used/)));
  await fill(adminB, email, `E2E Student ${ts}`, roll);
  check("add student: success message", await vis(adminB.getByText(/Student added/)));
  const { data: prof } = await admin.from("profiles").select("id, role, assigned_mess_id, roll_number, full_name").eq("email", email).single();
  if (prof) created.push(prof.id);
  check("the account exists: student, assigned to IFC-B, roll and name set", prof?.role === "student" && prof.assigned_mess_id === "ifc-b" && prof.roll_number === roll && prof.full_name === `E2E Student ${ts}`, JSON.stringify(prof));
  const sc = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const v = await sc.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
  check("the new student can sign in with an email code and sees their own profile", !v.error && (await sc.from("profiles").select("assigned_mess_id").single()).data?.assigned_mess_id === "ifc-b", v.error?.message);

  // list, search, remove
  await adminB.goto(`${BASE}/dashboard/admin/students`, { waitUntil: "networkidle" });
  const rows = adminB.getByTestId("student-row");
  check("students page lists IFC-B students (incl. the new one) and no IFC-A student", (await rows.filter({ hasText: email }).count()) === 1 && (await rows.filter({ hasText: "student@student.nitw.ac.in" }).count()) === 0 && (await rows.filter({ hasText: "student2@student" }).count()) === 1);
  await adminB.getByTestId("student-search").fill(roll.toLowerCase());
  check("search by roll number filters the list to 1", (await rows.count()) === 1 && (await rows.first().getAttribute("data-email")) === email);
  await adminB.screenshot({ path: "screenshots/students-admin-1440.png" });
  await adminB.getByTestId("remove-student").click();
  check("remove asks for confirmation first", await vis(adminB.getByTestId("confirm-remove")));
  await adminB.getByTestId("confirm-remove").click();
  await adminB.getByTestId("student-search").waitFor();
  await adminB.waitForTimeout(1500);
  check("after removal the student leaves the list, the account stays with no mess", (await adminB.getByTestId("student-row").filter({ hasText: email }).count()) === 0 && (await admin.from("profiles").select("assigned_mess_id").eq("id", prof.id).single()).data.assigned_mess_id === null);

  // IFC-A admin: cannot reach IFC-B students, can adopt the unassigned account
  const adminA = await open("admin@nitw.ac.in");
  await adminA.goto(`${BASE}/dashboard/admin/students`, { waitUntil: "networkidle" });
  check("IFC-A admin's list has no IFC-B students", (await adminA.getByTestId("student-row").filter({ hasText: "student2@student" }).count()) === 0 && (await adminA.getByTestId("student-row").filter({ hasText: "student@student.nitw.ac.in" }).count()) === 1);
  await adminA.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  await fill(adminA, email, `E2E Student ${ts}`, roll);
  check("IFC-A admin adds the existing unassigned account by email (assigned to IFC-A)", await vis(adminA.getByText(/existing student account was assigned/)) && (await admin.from("profiles").select("assigned_mess_id").eq("id", prof.id).single()).data.assigned_mess_id === "ifc-a");
  await fill(adminB, email, `E2E Student ${ts}`, roll);
  check("IFC-B admin can no longer take them: 'already in another mess'", await vis(adminB.getByText(/already in another mess/)));

  // warden: list all, move, add to any mess
  const warden = await open("warden@nitw.ac.in");
  await warden.goto(`${BASE}/dashboard/warden/students`, { waitUntil: "networkidle" });
  check("warden sees students of every mess and a mess picker on the add form", (await warden.getByTestId("student-row").count()) >= 3 && (await warden.locator("#st-mess").count()) === 1);
  const row = warden.getByTestId("student-row").filter({ hasText: email });
  await row.getByTestId("move-select").selectOption("krishna");
  check("warden moves the student between messes (IFC-A -> Krishna)", (await warden.getByTestId("students-msg").waitFor({ timeout: 8000 }).then(() => true, () => false)) && (await admin.from("profiles").select("assigned_mess_id").eq("id", prof.id).single()).data.assigned_mess_id === "krishna");
  await warden.locator("#st-mess").selectOption("priyadarshini");
  await fill(warden, `w.${ts}@student.nitw.ac.in`, `Warden Added ${ts}`, `WRD${ts}`);
  check("warden adds a new student to Priyadarshini", await vis(warden.getByText(/Student added/)));
  const w2 = (await admin.from("profiles").select("id, assigned_mess_id").eq("email", `w.${ts}@student.nitw.ac.in`).single()).data; if (w2) created.push(w2.id);
  check("...assigned to Priyadarshini", w2?.assigned_mess_id === "priyadarshini", JSON.stringify(w2));
  await warden.screenshot({ path: "screenshots/students-warden-1440.png" });
  const wsr = await open("student@student.nitw.ac.in");
  await wsr.goto(`${BASE}/dashboard/admin/students`, { waitUntil: "networkidle" });
  check("a student opening the admin students page gets the wrong-role notice", await vis(wsr.getByTestId("wrong-role")));
} finally {
  await browser?.close();
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from("provisioned_accounts").delete().like("email", "%e2e.%").then(() => {});
  await admin.from("provisioned_accounts").delete().like("email", `%${ts}@student.nitw.ac.in`).then(() => {});
  await admin.from("mess_membership_log").delete().in("student_id", created).then(() => {});
}
console.log(failed ? `\n${failed} FAILED` : "\nALL STUDENT MANAGEMENT TESTS PASSED");
process.exit(failed ? 1 : 0);
