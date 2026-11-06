import type { SupabaseClient } from "@supabase/supabase-js";
import { exportPublicKey, generateDeviceKeyPair } from "./token.ts";
import { toB64u } from "./base64url.ts";
import { idb } from "./idb.ts";

/** What the phone keeps: the NON-EXTRACTABLE private key (a CryptoKey object) plus its public handle. */
export interface StoredDevice { deviceId: string; deviceKey: string; privateKey: CryptoKey; label: string; enrolledAt: number }
const KEY = "device";

export const getStoredDevice = () => idb.get<StoredDevice>("kv", KEY);
export const forgetDevice = () => idb.del("kv", KEY);

export type EnrollError = "reauth_required" | "rate_limited" | "not_student" | "invalid_key" | "unknown";
export function classifyEnrollError(message: string): EnrollError {
  if (message.includes("reauth_required")) return "reauth_required";
  if (message.includes("rate_limited")) return "rate_limited";
  if (message.includes("only students")) return "not_student";
  if (message.includes("invalid public key")) return "invalid_key";
  return "unknown";
}

/** Generates a key pair on this phone, sends ONLY the public key, and stores the private key. */
export async function enrollThisDevice(supabase: SupabaseClient, label: string): Promise<StoredDevice> {
  const pair = await generateDeviceKeyPair();
  const pub = toB64u(await exportPublicKey(pair.publicKey));
  const { data, error } = await supabase.rpc("enroll_device", { p_label: label, p_public_key_b64u: pub });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const device: StoredDevice = { deviceId: row.device_id, deviceKey: row.device_key, privateKey: pair.privateKey, label, enrolledAt: Date.now() };
  await idb.put("kv", device, KEY);
  // Ask the browser not to evict this origin's storage (iOS Safari may still evict after ~7 idle days).
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  return device;
}
