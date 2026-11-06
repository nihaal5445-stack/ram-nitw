import { fromB64u, toB64u } from "./base64url.ts";

/** Signed rotating QR token. See docs/SPEC.md 8.1. */
export const STEP_SECONDS = 30;
export const WINDOW_STEPS = 1; // accept steps within +/-1 of the verifier's clock
export const PREFIX = "ram1";
const ECDSA = { name: "ECDSA", hash: "SHA-256" } as const;

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);
export const messageFor = (deviceKey: string, step: number) => new TextEncoder().encode(`${PREFIX}|${deviceKey}|${step}`);

export interface ParsedToken { deviceKey: string; step: number; signature: Uint8Array }

/** Strict parser: returns null for anything that is not exactly `ram1.<11 chars>.<digits>.<86 chars>`. */
export function parseToken(text: string): ParsedToken | null {
  const m = /^ram1\.([A-Za-z0-9_-]{11})\.(\d{1,12})\.([A-Za-z0-9_-]{86})$/.exec(text.trim());
  if (!m) return null;
  try {
    return { deviceKey: m[1], step: Number(m[2]), signature: fromB64u(m[3]) };
  } catch {
    return null;
  }
}

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  // extractable=false makes the PRIVATE key non-exportable; the public key can still be exported.
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key)); // 65 bytes, uncompressed point
}

export function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
}

export async function signToken(privateKey: CryptoKey, deviceKey: string, nowMs: number): Promise<string> {
  const step = stepAt(nowMs);
  const sig = new Uint8Array(await crypto.subtle.sign(ECDSA, privateKey, messageFor(deviceKey, step) as BufferSource));
  return `${PREFIX}.${deviceKey}.${step}.${toB64u(sig)}`;
}

export type VerifyResult =
  | { ok: true; step: number }
  | { ok: false; reason: "stale" | "future" | "bad_signature" };

/** Window check first (cheap, and gives a precise reason), then the signature. */
export async function verifyToken(publicKey: CryptoKey, t: ParsedToken, nowMs: number, window = WINDOW_STEPS): Promise<VerifyResult> {
  const now = stepAt(nowMs);
  if (t.step < now - window) return { ok: false, reason: "stale" };
  if (t.step > now + window) return { ok: false, reason: "future" };
  const ok = await crypto.subtle.verify(ECDSA, publicKey, t.signature as BufferSource, messageFor(t.deviceKey, t.step) as BufferSource);
  return ok ? { ok: true, step: t.step } : { ok: false, reason: "bad_signature" };
}

/** Seconds left until the displayed code rotates (for the countdown ring). */
export const secondsUntilRotation = (nowMs: number) => STEP_SECONDS - ((nowMs / 1000) % STEP_SECONDS);
