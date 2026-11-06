import test from "node:test";
import assert from "node:assert/strict";
import { generateDeviceKeyPair, exportPublicKey, importPublicKey, signToken, parseToken, verifyToken, stepAt, STEP_SECONDS, secondsUntilRotation } from "./token.ts";
import { toB64u, fromB64u } from "./base64url.ts";

const DEVICE = "AbCdEfGhIjK"; // 11 chars = 8 random bytes
const T0 = Date.UTC(2026, 10, 6, 7, 45, 0); // arbitrary fixed instant

async function setup() {
  const kp = await generateDeviceKeyPair();
  const pub = await importPublicKey(await exportPublicKey(kp.publicKey)); // what the server/scanner holds
  return { kp, pub };
}

test("base64url round trip, rejects bad characters", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(fromB64u(toB64u(bytes)), bytes);
  assert.throws(() => fromB64u("ab+/="));
});

test("private key is non-extractable, public key exports as 65 bytes", async () => {
  const { kp } = await setup();
  assert.equal(kp.privateKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("jwk", kp.privateKey));
  assert.equal((await exportPublicKey(kp.publicKey)).length, 65);
});

test("payload has the documented shape and size", async () => {
  const { kp } = await setup();
  const payload = await signToken(kp.privateKey, DEVICE, T0);
  assert.match(payload, /^ram1\.AbCdEfGhIjK\.\d+\.[A-Za-z0-9_-]{86}$/);
  assert.ok(payload.length < 120, `payload ${payload.length} chars`);
  const parsed = parseToken(payload)!;
  assert.equal(parsed.deviceKey, DEVICE);
  assert.equal(parsed.step, stepAt(T0));
  assert.equal(parsed.signature.length, 64);
});

test("valid token verifies at the same instant and across the +/-1 window", async () => {
  const { kp, pub } = await setup();
  const t = parseToken(await signToken(kp.privateKey, DEVICE, T0))!;
  for (const offset of [-STEP_SECONDS, 0, STEP_SECONDS]) {
    assert.deepEqual(await verifyToken(pub, t, T0 + offset * 1000), { ok: true, step: stepAt(T0) });
  }
});

test("a code older than the window is stale (screenshot test)", async () => {
  const { kp, pub } = await setup();
  const t = parseToken(await signToken(kp.privateKey, DEVICE, T0))!;
  // Displayed at the very start of its step; last accepted at the end of step+1, i.e. just under 60 s later.
  const start = stepAt(T0) * STEP_SECONDS * 1000;
  assert.equal((await verifyToken(pub, t, start + 59_999)).ok, true, "still valid just under 60 s after first display");
  const r = await verifyToken(pub, t, start + 2 * STEP_SECONDS * 1000);
  assert.deepEqual(r, { ok: false, reason: "stale" }, "rejected from 60 s onwards");
  assert.deepEqual(await verifyToken(pub, t, T0 + 70_000), { ok: false, reason: "stale" });
});

test("a token from the future is rejected", async () => {
  const { kp, pub } = await setup();
  const t = parseToken(await signToken(kp.privateKey, DEVICE, T0 + 5 * 60_000))!;
  assert.deepEqual(await verifyToken(pub, t, T0), { ok: false, reason: "future" });
});

test("tampering with device key or step breaks the signature", async () => {
  const { kp, pub } = await setup();
  const t = parseToken(await signToken(kp.privateKey, DEVICE, T0))!;
  assert.deepEqual(await verifyToken(pub, { ...t, deviceKey: "ZZZZZZZZZZZ" }, T0), { ok: false, reason: "bad_signature" });
  assert.deepEqual(await verifyToken(pub, { ...t, step: t.step + 1 }, T0), { ok: false, reason: "bad_signature" });
});

test("a signature from another device's key is rejected", async () => {
  const a = await setup();
  const b = await setup();
  const t = parseToken(await signToken(b.kp.privateKey, DEVICE, T0))!;
  assert.deepEqual(await verifyToken(a.pub, t, T0), { ok: false, reason: "bad_signature" });
});

test("parser rejects malformed input", async () => {
  const { kp } = await setup();
  const good = await signToken(kp.privateKey, DEVICE, T0);
  for (const bad of ["", "ram2." + good.slice(5), good + "x", good.replace("ram1.", "ram1.."), "hello", good.slice(0, -1), "ram1.short.1." + "A".repeat(86)]) {
    assert.equal(parseToken(bad), null, bad);
  }
  assert.ok(parseToken("  " + good + "\n"), "tolerates surrounding whitespace from scanners");
});

test("countdown is between 0 and 30 and aligned to the step", () => {
  const start = stepAt(T0) * STEP_SECONDS * 1000;
  assert.equal(secondsUntilRotation(start), STEP_SECONDS);
  assert.ok(Math.abs(secondsUntilRotation(start + 12_500) - 17.5) < 1e-9);
});
