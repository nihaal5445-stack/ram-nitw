import { fromB64u, toB64u } from "./base64url.ts";

/** Encrypts data at rest under a key derived from a staff PIN (PBKDF2-SHA256 -> AES-256-GCM). */
export const PBKDF2_ITERATIONS = 600_000;

export interface Wrapped { v: 1; iterations: number; salt: string; iv: string; ct: string }

async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function wrapWithPin(pin: string, data: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<Wrapped> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
  return { v: 1, iterations, salt: toB64u(salt), iv: toB64u(iv), ct: toB64u(ct) };
}

/** Returns null on a wrong PIN or tampered data (AES-GCM authenticates). */
export async function unwrapWithPin(pin: string, w: Wrapped): Promise<Uint8Array | null> {
  try {
    const key = await deriveKey(pin, fromB64u(w.salt), w.iterations);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(w.iv) as BufferSource }, key, fromB64u(w.ct) as BufferSource));
  } catch {
    return null;
  }
}
