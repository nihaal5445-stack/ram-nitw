import { importPublicKey, parseToken, verifyToken, STEP_SECONDS } from "./token.ts";

export interface IncomingScan {
  id: string;
  method: "qr" | "manual";
  scanned_at: string;
  token?: string; // raw QR text, for method "qr"
  roll_number?: string;
  reason_code?: string;
  note?: string;
}

export interface PreparedScan {
  id: string;
  method: "qr" | "manual";
  scanned_at: string;
  device_key?: string;
  step?: number;
  sig_ok?: boolean;
  roll_number?: string;
  reason_code?: string;
  note?: string;
}

/** `\x04ab...` (PostgREST bytea) -> bytes */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Verifies the ECDSA signature of every QR scan against the stored public key.
 * Time windows are NOT judged here (record_scans does that against scanned_at); here we only prove that the
 * holder of the device's private key produced this exact (device_key, step). Unparseable or unknown tokens get
 * sig_ok=false so record_scans rejects and flags them.
 */
export async function prepareScans(
  scans: IncomingScan[],
  publicKeysByDevice: Map<string, Uint8Array>,
): Promise<PreparedScan[]> {
  const cache = new Map<string, CryptoKey>();
  const out: PreparedScan[] = [];
  for (const s of scans) {
    if (s.method !== "qr") {
      out.push({ id: s.id, method: s.method, scanned_at: s.scanned_at, roll_number: s.roll_number, reason_code: s.reason_code, note: s.note });
      continue;
    }
    const parsed = s.token ? parseToken(s.token) : null;
    if (!parsed) {
      out.push({ id: s.id, method: "qr", scanned_at: s.scanned_at, device_key: "invalid", sig_ok: false });
      continue;
    }
    let sigOk = false;
    const raw = publicKeysByDevice.get(parsed.deviceKey);
    if (raw) {
      let key = cache.get(parsed.deviceKey);
      if (!key) { key = await importPublicKey(raw); cache.set(parsed.deviceKey, key); }
      // verify "at the token's own time" so only the signature, not the window, decides sig_ok
      const r = await verifyToken(key, parsed, parsed.step * STEP_SECONDS * 1000 + 1);
      sigOk = r.ok;
    }
    out.push({ id: s.id, method: "qr", scanned_at: s.scanned_at, device_key: parsed.deviceKey, step: parsed.step, sig_ok: sigOk });
  }
  return out;
}
