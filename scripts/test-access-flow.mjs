// End-to-end tests of the Phase 3 scan sync path against a RUNNING app (BASE, default http://localhost:3100)
// and local Supabase: real ECDSA keys, real sessions, the /api/scanner/sync route, record_scans, RLS.
// Run: npm run test:access   (needs: supabase running, `next start -p 3100`, SUPABASE_SERVICE_ROLE_KEY in .env.local)
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { generateDeviceKeyPair, exportPublicKey, signToken } from "../src/lib/access/token.ts";
import { toB64u } from "../src/lib/access/base64url.ts";
import { istParts } from "../src/lib/access/slots.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = Object.fromEntries(execSync("npx supabase status -o env 2>/dev/null").toString().split("\n")
  .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts);
const anon = () => createClient(env.API_URL, env.ANON_KEY, opts);
const S1 = "11111111-1111-1111-1111-111111111111";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failed++; };
const stamp = Date.now();

// "yesterday" in IST so every slot time is in the past but inside the 72 h window
const y = new Date(Date.parse(istParts(Date.now()).date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
const at = (hhmm) => Date.parse(`${y}T${hhmm}:00+05:30`);

async function login(email, password = "password123") {
  const c = anon();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, token: data.session.access_token, id: data.user.id };
}
async function newStudent(email, mess, roll) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "password123", email_confirm: true });
  if (error) throw new Error(error.message);
  await admin.from("profiles").update({ assigned_mess_id: mess, roll_number: roll }).eq("id", data.user.id);
  return data.user.id;
}
async function enroll(session, label) {
  const kp = await generateDeviceKeyPair();
  const pub = toB64u(await exportPublicKey(kp.publicKey));
  const { data, error } = await session.c.rpc("enroll_device", { p_label: label, p_public_key_b64u: pub });
  if (error) throw new Error(`enroll: ${error.message}`);
  return { kp, key: data[0].device_key };
}
async function sync(token, scannerId, scans) {
  const res = await fetch(`${BASE}/api/scanner/sync`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ scannerId, scans }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const qr = async (dev, ms, scannedMs = ms) => ({ id: randomUUID(), method: "qr", token: await signToken(dev.kp.privateKey, dev.key, ms), scanned_at: new Date(scannedMs).toISOString() });
const one = (r) => `${r.body.results?.[0]?.status}:${r.body.results?.[0]?.reason ?? ""}`;

// ── clean slate (rerunnable) ──
await admin.from("fraud_flags").delete().neq("id", "00000000-0000-0000-0000-000000000000");
await admin.from("meal_redemptions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
await admin.from("student_devices").delete().eq("student_id", S1);

const student = await login("student@student.nitw.ac.in");
const counter = await login("counter@nitw.ac.in");
const dev1 = await enroll(student, "e2e phone");
const s2 = await newStudent(`e2e-s2-${stamp}@student.nitw.ac.in`, "krishna", `E2E${stamp}`.slice(0, 12));
const s2Session = await login(`e2e-s2-${stamp}@student.nitw.ac.in`);
const dev2 = await enroll(s2Session, "krishna phone");
const s3 = await newStudent(`e2e-s3-${stamp}@student.nitw.ac.in`, "ifc-a", `E3${stamp}`.slice(0, 12));
const s3Roll = (await admin.from("profiles").select("roll_number").eq("id", s3).single()).data.roll_number;

const { data: scannerId, error: regErr } = await counter.c.rpc("register_scanner", { p_label: "e2e laptop" });
check("counter registers a scanner", !regErr && !!scannerId, regErr?.message);
const { data: bundle, error: bErr } = await counter.c.rpc("issue_scanner_bundle", { p_scanner_id: scannerId });
check("bundle contains the student's device key, no public-key secrets beyond the public key",
  !bErr && bundle.students.some((s) => s.device_key === dev1.key && s.public_key.length === 87) && !bundle.students.some((s) => s.student_id === s2), bErr?.message);

// ── auth ──
check("sync without credentials -> 401", (await sync(null, scannerId, [])).status === 401);
check("sync as a student -> 403", (await sync(student.token, scannerId, [])).status === 403);
check("malformed body -> 400", (await sync(counter.token, "not-a-uuid", [])).status === 400);
check("more than 500 scans -> 400", (await sync(counter.token, scannerId, Array.from({ length: 501 }, () => ({})))).status === 400);
const direct = await counter.c.rpc("record_scans", { p_staff_id: counter.id, p_scanner_id: scannerId, p_scans: [] });
check("a signed-in counter cannot call record_scans directly (must go through signature verification)", !!direct.error, "call succeeded");

// ── the four required cases, with real signatures ──
const lunch = at("12:30");
let r = await sync(counter.token, scannerId, [await qr(dev1, lunch)]);
check("valid signed QR accepted", one(r) === "accepted:", JSON.stringify(r.body));
const sameAgain = await qr(dev1, lunch + 5 * 60_000);
r = await sync(counter.token, scannerId, [sameAgain]);
check("SPEC: second scan in the same slot fails", one(r) === "duplicate:already_admitted", JSON.stringify(r.body));
r = await sync(counter.token, scannerId, [sameAgain]);
check("replaying the same scan id is idempotent", r.body.results?.[0]?.replay === true, JSON.stringify(r.body));

r = await sync(counter.token, scannerId, [await qr(dev2, at("20:00"))]);
check("SPEC: wrong-mess scan fails (student of another mess)", one(r) === "rejected:wrong_mess", JSON.stringify(r.body));

const breakfast = at("08:00");
r = await sync(counter.token, scannerId, [await qr(dev1, breakfast - 90_000, breakfast)]);
check("SPEC: code signed 90 s before the scan (screenshot) fails", one(r) === "rejected:stale_code", JSON.stringify(r.body));
const dinner = at("20:00");
r = await sync(counter.token, scannerId, [await qr(dev1, dinner - 30_000, dinner)]);
check("code one step (<= 60 s) old still accepted", one(r) === "accepted:", JSON.stringify(r.body));

const snacks = at("17:00");
r = await sync(counter.token, scannerId, [await qr(dev1, snacks, snacks)]);
check("SPEC: offline scan syncs later (scanned many hours ago)", one(r) === "accepted:" , JSON.stringify(r.body));
const row = (await admin.from("meal_redemptions").select("received_at, scanned_at").eq("student_id", S1).eq("slot", "snacks").single()).data;
check("...received_at is much later than scanned_at", Date.parse(row.received_at) - Date.parse(row.scanned_at) > 3600_000);

// ── forgery by a dishonest counter staffer ──
const attacker = await generateDeviceKeyPair();
const forged = { id: randomUUID(), method: "qr", token: await signToken(attacker.privateKey, dev1.key, at("12:30")), scanned_at: new Date(at("12:30")).toISOString() };
r = await sync(counter.token, scannerId, [forged]);
check("token for a real device key signed by the WRONG private key -> bad_signature", one(r) === "rejected:bad_signature", JSON.stringify(r.body));
r = await sync(counter.token, scannerId, [{ id: randomUUID(), method: "qr", token: "ram1.AAAAAAAAAAA.1.".padEnd(19 + 86, "A"), scanned_at: new Date(lunch).toISOString() }]);
check("garbage token -> rejected, nothing recorded as accepted", r.body.results?.[0]?.status === "rejected", JSON.stringify(r.body));
check("extra field sig_ok:true injected by the client is ignored", await (async () => {
  const f = { ...forged, id: randomUUID(), sig_ok: true };
  const x = await sync(counter.token, scannerId, [f]); return one(x) === "rejected:bad_signature";
})());

// ── manual fallback through the route ──
r = await sync(counter.token, scannerId, [{ id: randomUUID(), method: "manual", roll_number: s3Roll, scanned_at: new Date(lunch).toISOString() }]);
check("manual entry without a reason rejected", one(r) === "rejected:manual_reason_required", JSON.stringify(r.body));
r = await sync(counter.token, scannerId, [{ id: randomUUID(), method: "manual", roll_number: s3Roll, scanned_at: new Date(lunch).toISOString(), reason_code: "phone_dead" }]);
check("manual entry with a reason accepted", one(r) === "accepted:", JSON.stringify(r.body));

// ── what ended up in the database ──
const acc = (await admin.from("meal_redemptions").select("student_id, slot, status").eq("status", "accepted")).data;
check("exactly one accepted row per (student, slot)", new Set(acc.map((a) => a.student_id + a.slot)).size === acc.length);
const flags = (await admin.from("fraud_flags").select("kind")).data.map((f) => f.kind);
for (const k of ["duplicate_same_scanner", "wrong_mess", "stale_code", "bad_signature"]) check(`fraud flag recorded: ${k}`, flags.includes(k));

// cleanup
for (const id of [s2, s3]) await admin.auth.admin.deleteUser(id);
console.log(failed ? `\n${failed} FAILED` : "\nALL ACCESS FLOW TESTS PASSED");
process.exit(failed ? 1 : 0);
