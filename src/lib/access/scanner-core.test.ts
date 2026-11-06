import test from "node:test";
import assert from "node:assert/strict";
import { evaluateManual, evaluateQr, makeContext, MAX_BAD_CODES, type Bundle, type LedgerEntry } from "./scanner-core.ts";
import { exportPublicKey, generateDeviceKeyPair, signToken } from "./token.ts";
import { toB64u } from "./base64url.ts";
import { ledgerKey } from "./slots.ts";

const LUNCH = Date.UTC(2026, 10, 6, 7, 45);          // 13:15 IST
const SLOTS = [{ slot: "lunch", starts: "12:00", ends: "14:00" }, { slot: "dinner", starts: "19:30", ends: "21:30" }];

async function world(opts: { revoked?: string[]; expiresAt?: number } = {}) {
  const kp = await generateDeviceKeyPair();
  const other = await generateDeviceKeyPair();
  const bundle: Bundle = {
    scanner_id: "sc", mess_id: "ifc-a", issued_at: new Date(LUNCH - 3600e3).toISOString(),
    expires_at: new Date(opts.expiresAt ?? LUNCH + 8 * 3600e3).toISOString(), server_time: new Date(LUNCH).toISOString(),
    students: [
      { student_id: "s1", name: "Asha", roll: "R001", device_key: "AAAAAAAAAAA", public_key: toB64u(await exportPublicKey(kp.publicKey)) },
      { student_id: "s2", name: "Ravi", roll: "R002", device_key: null, public_key: null }, // enrolled nothing: manual only
    ],
    revoked_keys: opts.revoked ?? [], slots: SLOTS,
  };
  const ledger = new Map<string, LedgerEntry>();
  const ctx = makeContext(bundle, async (k) => ledger.get(k), async () => [...ledger.values()].filter((e) => e.method === "manual"));
  return { kp, other, bundle, ledger, ctx, tok: (ms = LUNCH, key = "AAAAAAAAAAA", pair = kp) => signToken(pair.privateKey, key, ms) };
}

test("valid QR admits and names the student and slot", async () => {
  const w = await world();
  const r = await evaluateQr(await w.tok(), w.ctx, LUNCH);
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.student.name, "Asha"); assert.equal(r.slot, "lunch"); assert.equal(r.date, "2026-11-06"); }
});

test("one entry per student per slot: second scan is a duplicate, with the first scan's time", async () => {
  const w = await world();
  w.ledger.set(ledgerKey("s1", "2026-11-06", "lunch"), { key: ledgerKey("s1", "2026-11-06", "lunch"), studentId: "s1", slot: "lunch", date: "2026-11-06", scannedAt: LUNCH - 120_000, method: "qr", scanId: "x" });
  const r = await evaluateQr(await w.tok(), w.ctx, LUNCH);
  assert.deepEqual(r.ok ? null : { reason: r.reason, firstAt: (r as { firstAt?: number }).firstAt }, { reason: "duplicate", firstAt: LUNCH - 120_000 });
});

test("the same student can still eat in the next slot", async () => {
  const w = await world();
  w.ledger.set(ledgerKey("s1", "2026-11-06", "lunch"), { key: "k", studentId: "s1", slot: "lunch", date: "2026-11-06", scannedAt: LUNCH, method: "qr", scanId: "x" });
  const dinner = Date.UTC(2026, 10, 6, 14, 45); // 20:15 IST
  assert.equal((await evaluateQr(await w.tok(dinner), w.ctx, dinner)).ok, true);
});

test("screenshot older than 60 s is stale; a code from the future is refused", async () => {
  const w = await world();
  // LUNCH sits exactly on a 30 s boundary, so (LUNCH - 1 s) is the previous step: still inside the window.
  assert.equal((await evaluateQr(await w.tok(LUNCH - 1_000), w.ctx, LUNCH)).ok, true);
  // (LUNCH - 31 s) is two steps back: stale. The guarantee is "never valid beyond 60 s", not "always valid for 60 s".
  const w1 = await world();
  assert.equal((await evaluateQr(await w1.tok(LUNCH - 31_000), w1.ctx, LUNCH) as { reason: string }).reason, "stale");
  const w2 = await world();
  assert.deepEqual(await evaluateQr(await w2.tok(LUNCH - 90_000), w2.ctx, LUNCH), { ok: false, reason: "stale", student: w2.bundle.students[0] });
  const w3 = await world();
  const r = await evaluateQr(await w3.tok(LUNCH + 120_000), w3.ctx, LUNCH);
  assert.equal(r.ok === false && r.reason, "future");
});

test("a student who is not in this mess's bundle is 'unknown_device' (the wrong-mess case)", async () => {
  const w = await world();
  const r = await evaluateQr(await w.tok(LUNCH, "ZZZZZZZZZZZ"), w.ctx, LUNCH);
  assert.equal(r.ok === false && r.reason, "unknown_device");
});

test("a signature from someone else's private key is rejected, and repeated forgeries lock the device", async () => {
  const w = await world();
  const forged = await w.tok(LUNCH, "AAAAAAAAAAA", w.other);
  for (let i = 0; i < MAX_BAD_CODES; i++) assert.equal((await evaluateQr(forged, w.ctx, LUNCH + i) as { reason: string }).reason, "bad_signature");
  const good = await w.tok();
  const r = await evaluateQr(good, w.ctx, LUNCH + 10);
  assert.equal(r.ok === false && r.reason, "locked", "even the genuine code is refused while locked");
  const later = await evaluateQr(good, w.ctx, LUNCH + 61_000);
  assert.notEqual(later.ok === false && later.reason, "locked", "lock expires after 60 s");
});

test("revoked device, outside meal time, malformed text and an expired bundle", async () => {
  const w = await world({ revoked: ["AAAAAAAAAAA"] });
  const r1 = await evaluateQr(await w.tok(), w.ctx, LUNCH);
  assert.equal(r1.ok === false && r1.reason, "revoked_device");
  const w2 = await world();
  const mid = Date.UTC(2026, 10, 6, 5, 30); // 11:00 IST
  assert.equal((await evaluateQr(await w2.tok(mid), w2.ctx, mid) as { reason: string }).reason, "outside_meal_time");
  assert.equal((await evaluateQr("hello", w2.ctx, LUNCH) as { reason: string }).reason, "malformed");
  const w3 = await world({ expiresAt: LUNCH - 1 });
  assert.equal((await evaluateQr(await w3.tok(), w3.ctx, LUNCH) as { reason: string }).reason, "bundle_expired");
});

test("manual entry: needs a valid reason; 'other' needs a note; unknown roll; case-insensitive roll", async () => {
  const w = await world();
  assert.equal((await evaluateManual("R001", "", "", w.ctx, LUNCH) as { reason: string }).reason, "manual_reason_required");
  assert.equal((await evaluateManual("R001", "because", "", w.ctx, LUNCH) as { reason: string }).reason, "manual_reason_required");
  assert.equal((await evaluateManual("R001", "other", "no", w.ctx, LUNCH) as { reason: string }).reason, "manual_reason_required");
  assert.equal((await evaluateManual("NOPE", "phone_dead", "", w.ctx, LUNCH) as { reason: string }).reason, "unknown_roll");
  const ok = await evaluateManual("  r002 ", "phone_dead", "", w.ctx, LUNCH);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.student.name, "Ravi");
});

test("manual entry obeys one-per-slot and local rate limits", async () => {
  const w = await world();
  w.ledger.set(ledgerKey("s2", "2026-11-06", "lunch"), { key: ledgerKey("s2", "2026-11-06", "lunch"), studentId: "s2", slot: "lunch", date: "2026-11-06", scannedAt: LUNCH - 1000, method: "manual", scanId: "m" });
  assert.equal((await evaluateManual("R002", "phone_dead", "", w.ctx, LUNCH) as { reason: string }).reason, "duplicate");

  const w2 = await world();
  for (let i = 0; i < 10; i++) w2.ledger.set("x" + i, { key: "x" + i, studentId: "other" + i, slot: "lunch", date: "2026-11-06", scannedAt: LUNCH - i * 1000, method: "manual", scanId: "m" + i });
  assert.equal((await evaluateManual("R001", "phone_dead", "", w2.ctx, LUNCH) as { reason: string }).reason, "manual_rate_limit_staff");

  const w3 = await world();
  for (let i = 1; i <= 3; i++) w3.ledger.set("y" + i, { key: "y" + i, studentId: "s1", slot: "lunch", date: "d" + i, scannedAt: LUNCH - i * 86_400_000, method: "manual", scanId: "m" + i });
  assert.equal((await evaluateManual("R001", "phone_dead", "", w3.ctx, LUNCH) as { reason: string }).reason, "manual_rate_limit_student");
});
