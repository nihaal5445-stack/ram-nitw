// End-to-end sign-up rule tests against the local Supabase (GoTrue + DB trigger).
// Run: npm run test:signup   (needs `supabase start`; reads keys from `npx supabase status -o env`)
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  execSync("npx supabase status -o env 2>/dev/null").toString().split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const URL = env.API_URL, ANON = env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = () => createClient(URL, ANON, opts);
const admin = createClient(URL, SERVICE, opts);
const stamp = Date.now();
const created = [];
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failed++; };
const profileOf = async (email) => (await admin.from("profiles").select("role,assigned_mess_id,linked_student_id").eq("email", email).maybeSingle()).data;

// 1. Student tab: new @student.nitw.ac.in account may be created via OTP
{
  const email = `new${stamp}@student.nitw.ac.in`;
  const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  const p = await profileOf(email);
  check("student email + shouldCreateUser:true creates a student", !error && p?.role === "student", error?.message ?? JSON.stringify(p));
}
// 2. Parents/Staff tab: shouldCreateUser:false for an unknown email -> otp_disabled, no account
{
  const email = `unknown${stamp}@example.com`;
  const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  check("unknown parent/staff email + shouldCreateUser:false -> otp_disabled", error?.code === "otp_disabled", JSON.stringify(error));
  check("...and no account/profile was created", !(await profileOf(email)));
}
// 3. Existing parent (seed) can still request a link with shouldCreateUser:false
{
  const { error } = await anon().auth.signInWithOtp({ email: "parent@example.com", options: { shouldCreateUser: false } });
  check("existing parent + shouldCreateUser:false succeeds", !error, error?.message);
}
// 4. Someone bypassing the UI and forcing shouldCreateUser:true with a non-student email is rejected by the DB trigger
{
  const email = `forced${stamp}@example.com`;
  const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  check("non-student email + shouldCreateUser:true rejected by DB", !!error && !(await profileOf(email)), JSON.stringify(error));
}
// 5. Direct sign-up (password) with a non-student email is rejected
{
  const email = `direct${stamp}@example.com`;
  const { error } = await anon().auth.signUp({ email, password: "Passw0rd!x1" });
  check("anon signUp with non-student email rejected", !!error && !(await profileOf(email)), JSON.stringify(error));
}
// 6. Forged marker in user_metadata (all a self-signup controls) does not bypass
{
  const email = `forge${stamp}@example.com`;
  const { error } = await anon().auth.signUp({ email, password: "Passw0rd!x1", options: { data: { ram_provisioned: true, ram_role: "warden" } } });
  check("forged user_metadata marker rejected", !!error && !(await profileOf(email)), JSON.stringify(error));
}
// 7. Trusted code that skips the allow-list is rejected too
{
  const email = `noallow${stamp}@nitw.ac.in`;
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  check("admin createUser without allow-list row rejected", !!error && !(await profileOf(email)), JSON.stringify(error));
}
// 8. A non-warden session cannot add to the allow-list (RLS)
{
  const s = anon();
  await s.auth.signInWithPassword({ email: "student@student.nitw.ac.in", password: "password123" });
  const { error } = await s.from("provisioned_accounts").insert({ email: `sneaky${stamp}@example.com`, role: "warden", provisioned_by: "11111111-1111-1111-1111-111111111111" });
  check("student cannot add an allow-list entry", !!error, "insert unexpectedly succeeded");
}
// 9. Warden path, end to end: warden session -> allow-list row -> admin createUser -> profile -> can sign in
{
  const wardenSession = anon();
  await wardenSession.auth.signInWithPassword({ email: "warden@nitw.ac.in", password: "password123" });
  const wardenId = (await wardenSession.auth.getUser()).data.user?.id;
  const email = `Staff${stamp}@nitw.ac.in`; // mixed case on purpose
  const { error: allowErr } = await wardenSession.from("provisioned_accounts").insert({
    email: email.toLowerCase(), role: "counter_staff", assigned_mess_id: "ifc-a", provisioned_by: wardenId,
  });
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (data?.user) created.push(data.user.id);
  const p = await profileOf(email.toLowerCase());
  check("warden-provisioned staff account created with role + mess", !allowErr && !error && p?.role === "counter_staff" && p?.assigned_mess_id === "ifc-a", allowErr?.message ?? error?.message ?? JSON.stringify(p));
  const r = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  check("...and that staff account can then request a sign-in link", !r.error, r.error?.message);
  const left = await admin.from("provisioned_accounts").select("email").eq("email", email.toLowerCase());
  check("...and the allow-list row was consumed", left.data?.length === 0);
}
// 10. Warden-provisioned parent linked to the seed student
{
  const wardenSession = anon();
  await wardenSession.auth.signInWithPassword({ email: "warden@nitw.ac.in", password: "password123" });
  const wardenId = (await wardenSession.auth.getUser()).data.user?.id;
  const email = `parent${stamp}@example.com`;
  await wardenSession.from("provisioned_accounts").insert({ email, role: "parent", linked_student_id: "11111111-1111-1111-1111-111111111111", provisioned_by: wardenId });
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (data?.user) created.push(data.user.id);
  const p = await profileOf(email);
  check("warden-provisioned parent linked to a student", !error && p?.role === "parent" && p?.linked_student_id === "11111111-1111-1111-1111-111111111111", error?.message ?? JSON.stringify(p));
}

// cleanup
const { data: all } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of all?.users ?? []) if (u.email?.toLowerCase().includes(String(stamp))) await admin.auth.admin.deleteUser(u.id);
console.log(failed ? `\n${failed} FAILED` : "\nALL SIGNUP FLOW TESTS PASSED");
process.exit(failed ? 1 : 0);
