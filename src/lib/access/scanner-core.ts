import { fromB64u } from "./base64url.ts";
import { slotAt, ledgerKey, type SlotWindow } from "./slots.ts";
import { importPublicKey, parseToken, verifyToken } from "./token.ts";

/** Pure offline-verification logic for the counter scanner. No DOM, no storage: storage is injected. */

export interface BundleStudent { student_id: string; name: string | null; roll: string | null; device_key: string | null; public_key: string | null }
export interface Bundle {
  scanner_id: string; mess_id: string; issued_at: string; expires_at: string; server_time: string;
  students: BundleStudent[]; revoked_keys: string[]; slots: SlotWindow[];
}
export interface LedgerEntry { key: string; studentId: string; slot: string; date: string; scannedAt: number; method: "qr" | "manual"; scanId: string }

export const MAX_BAD_CODES = 5;          // per device key
export const LOCKOUT_MS = 60_000;
export const MANUAL_PER_HOUR = 10;       // per scanner session/staff
export const MANUAL_PER_STUDENT_WEEK = 3;
export const MANUAL_REASONS = ["phone_dead", "app_problem", "lost_phone", "clock_wrong", "other"] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

export interface ScanContext {
  bundle: Bundle;
  byDevice: Map<string, BundleStudent>;
  byRoll: Map<string, BundleStudent>;
  revoked: Set<string>;
  keys: Map<string, CryptoKey>;
  failures: Map<string, number[]>;
  getLedger: (key: string) => Promise<LedgerEntry | undefined>;
  /** accepted manual entries made on this device, for local rate limiting */
  manualHistory: () => Promise<LedgerEntry[]>;
}

export function makeContext(bundle: Bundle, getLedger: ScanContext["getLedger"], manualHistory: ScanContext["manualHistory"]): ScanContext {
  const byDevice = new Map<string, BundleStudent>();
  const byRoll = new Map<string, BundleStudent>();
  for (const s of bundle.students) {
    if (s.device_key) byDevice.set(s.device_key, s);
    if (s.roll) byRoll.set(s.roll.trim().toUpperCase(), s);
  }
  return { bundle, byDevice, byRoll, revoked: new Set(bundle.revoked_keys), keys: new Map(), failures: new Map(), getLedger, manualHistory };
}

export type RejectReason =
  | "bundle_expired" | "malformed" | "unknown_device" | "revoked_device" | "locked" | "stale" | "future"
  | "bad_signature" | "outside_meal_time" | "unknown_roll" | "manual_reason_required" | "manual_rate_limit_staff" | "manual_rate_limit_student";

export type Outcome =
  | { ok: true; student: BundleStudent; slot: string; date: string; step?: number }
  | { ok: false; reason: "duplicate"; student: BundleStudent; slot: string; firstAt: number }
  | { ok: false; reason: RejectReason; student?: BundleStudent };

const expired = (ctx: ScanContext, nowMs: number) => nowMs > Date.parse(ctx.bundle.expires_at);

async function admissionCheck(ctx: ScanContext, student: BundleStudent, nowMs: number): Promise<Outcome | { slot: string; date: string }> {
  const at = slotAt(ctx.bundle.slots, nowMs);
  if (!at) return { ok: false, reason: "outside_meal_time", student };
  const prior = await ctx.getLedger(ledgerKey(student.student_id, at.date, at.slot));
  if (prior) return { ok: false, reason: "duplicate", student, slot: at.slot, firstAt: prior.scannedAt };
  return at;
}

export async function evaluateQr(text: string, ctx: ScanContext, nowMs: number): Promise<Outcome> {
  if (expired(ctx, nowMs)) return { ok: false, reason: "bundle_expired" };
  const t = parseToken(text);
  if (!t) return { ok: false, reason: "malformed" };
  const student = ctx.byDevice.get(t.deviceKey);
  if (!student || !student.public_key) return { ok: false, reason: "unknown_device" }; // also covers a student of another mess
  if (ctx.revoked.has(t.deviceKey)) return { ok: false, reason: "revoked_device", student };

  const recent = (ctx.failures.get(t.deviceKey) ?? []).filter((ms) => nowMs - ms < LOCKOUT_MS);
  if (recent.length >= MAX_BAD_CODES) return { ok: false, reason: "locked", student };

  let key = ctx.keys.get(t.deviceKey);
  if (!key) { key = await importPublicKey(fromB64u(student.public_key)); ctx.keys.set(t.deviceKey, key); }
  const v = await verifyToken(key, t, nowMs);
  if (!v.ok) {
    if (v.reason === "bad_signature") ctx.failures.set(t.deviceKey, [...recent, nowMs]);
    return { ok: false, reason: v.reason === "bad_signature" ? "bad_signature" : v.reason, student };
  }

  const adm = await admissionCheck(ctx, student, nowMs);
  if ("ok" in adm) return adm;
  return { ok: true, student, slot: adm.slot, date: adm.date, step: v.step };
}

export async function evaluateManual(
  roll: string, reason: string, note: string, ctx: ScanContext, nowMs: number,
): Promise<Outcome> {
  if (expired(ctx, nowMs)) return { ok: false, reason: "bundle_expired" };
  if (!(MANUAL_REASONS as readonly string[]).includes(reason) || (reason === "other" && note.trim().length < 5)) {
    return { ok: false, reason: "manual_reason_required" };
  }
  const student = ctx.byRoll.get(roll.trim().toUpperCase());
  if (!student) return { ok: false, reason: "unknown_roll" };

  const history = await ctx.manualHistory();
  if (history.filter((h) => nowMs - h.scannedAt < 3_600_000).length >= MANUAL_PER_HOUR) return { ok: false, reason: "manual_rate_limit_staff", student };
  if (history.filter((h) => h.studentId === student.student_id && nowMs - h.scannedAt < 7 * 86_400_000).length >= MANUAL_PER_STUDENT_WEEK) {
    return { ok: false, reason: "manual_rate_limit_student", student };
  }

  const adm = await admissionCheck(ctx, student, nowMs);
  if ("ok" in adm) return adm;
  return { ok: true, student, slot: adm.slot, date: adm.date };
}
