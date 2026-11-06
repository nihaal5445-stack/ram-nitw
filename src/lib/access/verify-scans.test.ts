import test from "node:test";
import assert from "node:assert/strict";
import { prepareScans, hexToBytes } from "./verify-scans.ts";
import { generateDeviceKeyPair, exportPublicKey, signToken } from "./token.ts";

const KEY = "AbCdEfGhIjK";
const AT = "2026-11-05T07:00:00.000Z";

test("hexToBytes parses PostgREST bytea", () => {
  assert.deepEqual(hexToBytes("\\x0401ff"), new Uint8Array([4, 1, 255]));
});

test("prepareScans: valid signature -> sig_ok, tampered/unknown/garbage -> not ok", async () => {
  const kp = await generateDeviceKeyPair();
  const pub = await exportPublicKey(kp.publicKey);
  const keys = new Map([[KEY, pub]]);
  const good = await signToken(kp.privateKey, KEY, Date.parse(AT));
  const tampered = good.slice(0, -3) + (good.endsWith("AAA") ? "BBB" : "AAA");
  const other = await generateDeviceKeyPair();
  const foreign = await signToken(other.privateKey, KEY, Date.parse(AT)); // signed by a different private key

  const out = await prepareScans([
    { id: "1", method: "qr", scanned_at: AT, token: good },
    { id: "2", method: "qr", scanned_at: AT, token: tampered },
    { id: "3", method: "qr", scanned_at: AT, token: foreign },
    { id: "4", method: "qr", scanned_at: AT, token: good.replace(KEY, "ZZZZZZZZZZZ") },
    { id: "5", method: "qr", scanned_at: AT, token: "garbage" },
    { id: "6", method: "manual", scanned_at: AT, roll_number: "R1", reason_code: "phone_dead" },
  ], keys);
  assert.deepEqual(out.map((o) => o.sig_ok), [true, false, false, false, false, undefined]);
  assert.equal(out[0].step, Math.floor(Date.parse(AT) / 30000));
  assert.equal(out[5].roll_number, "R1");
});

test("an OLD but genuine signature still verifies here (time windows are record_scans' job)", async () => {
  const kp = await generateDeviceKeyPair();
  const keys = new Map([[KEY, await exportPublicKey(kp.publicKey)]]);
  const old = await signToken(kp.privateKey, KEY, Date.parse("2020-01-01T00:00:00Z"));
  const [r] = await prepareScans([{ id: "1", method: "qr", scanned_at: AT, token: old }], keys);
  assert.equal(r.sig_ok, true);
});
