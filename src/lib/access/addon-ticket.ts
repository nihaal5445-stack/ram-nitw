import { fromB64u, toB64u } from "./base64url.ts";
import { slotAt, type SlotWindow } from "./slots.ts";

/**
 * Add-on ticket: `ramA.<base64url(json)>.<signature>`. The SERVER signs it (ECDSA P-256) after the (mock) payment;
 * scanners hold only the server's public key, so they verify offline and cannot forge tickets.
 * Valid for one mess, one date and one slot; redeemed once (local ledger offline, DB at sync).
 */
export interface AddonPayload { i: string; m: string; d: string; s: string; n: string; u: string; k?: "pass" } // k = "pass": a single-meal mess-switch pass (n = the home mess) // purchase id, mess, date, slot, item name, student name
export const ADDON_PREFIX = "ramA";
const ECDSA = { name: "ECDSA", hash: "SHA-256" } as const;
const enc = new TextEncoder();

export function parseAddonTicket(text: string): { payload: AddonPayload; body: string; sig: Uint8Array } | null {
  const m = /^ramA\.([A-Za-z0-9_-]{20,900})\.([A-Za-z0-9_-]{86})$/.exec(text.trim());
  if (!m) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64u(m[1]))) as AddonPayload;
    if (![p.i, p.m, p.d, p.s, p.n, p.u].every((v) => typeof v === "string")) return null;
    if (p.k !== undefined && p.k !== "pass") return null;
    return { payload: p, body: m[1], sig: fromB64u(m[2]) };
  } catch { return null; }
}

export async function signAddonTicket(privateKey: CryptoKey, p: AddonPayload): Promise<string> {
  const body = toB64u(enc.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign(ECDSA, privateKey, enc.encode(`${ADDON_PREFIX}|${body}`) as BufferSource));
  return `${ADDON_PREFIX}.${body}.${toB64u(sig)}`;
}

export type AddonOutcome =
  | { ok: true; payload: AddonPayload }
  | { ok: false; reason: "addon_malformed" | "addon_no_key" | "addon_bad_signature" | "addon_wrong_mess" | "addon_wrong_slot" | "addon_used"; payload?: AddonPayload };

/** Pure offline check. `used` = the local ledger already holds this purchase id. */
export async function evaluateAddonTicket(
  text: string, serverPublicKeyB64u: string | undefined, messId: string, slots: SlotWindow[], nowMs: number, used: (id: string) => Promise<boolean>, demo = false,
): Promise<AddonOutcome> {
  const t = parseAddonTicket(text);
  if (!t) return { ok: false, reason: "addon_malformed" };
  if (!serverPublicKeyB64u) return { ok: false, reason: "addon_no_key", payload: t.payload };
  const key = await crypto.subtle.importKey("raw", fromB64u(serverPublicKeyB64u) as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const good = await crypto.subtle.verify(ECDSA, key, t.sig as BufferSource, enc.encode(`${ADDON_PREFIX}|${t.body}`) as BufferSource);
  if (!good) return { ok: false, reason: "addon_bad_signature" };
  if (t.payload.m !== messId) return { ok: false, reason: "addon_wrong_mess", payload: t.payload };
  const at = slotAt(slots, nowMs, 15, demo);
  if (!at || at.date !== t.payload.d || at.slot !== t.payload.s) return { ok: false, reason: "addon_wrong_slot", payload: t.payload };
  if (await used(t.payload.i)) return { ok: false, reason: "addon_used", payload: t.payload };
  return { ok: true, payload: t.payload };
}
