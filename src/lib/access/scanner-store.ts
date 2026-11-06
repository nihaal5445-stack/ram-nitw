import { idb } from "./idb.ts";
import { unwrapWithPin, wrapWithPin, type Wrapped } from "./pin-vault.ts";
import type { Bundle, LedgerEntry } from "./scanner-core.ts";

/** Browser-side persistence for the offline scanner. */
export const MAX_PIN_FAILURES = 10;
const LEDGER_KEEP_MS = 8 * 86_400_000;

export interface OutboxItem {
  id: string;
  method: "qr" | "manual" | "addon";
  scanned_at: string;
  token?: string;
  roll_number?: string;
  reason_code?: string;
  note?: string;
  /** what this device decided, so a later server verdict can be compared */
  local: "admitted" | "duplicate" | "rejected";
  studentName?: string | null;
}

export interface SyncResultRow { id: string; status: "accepted" | "duplicate" | "rejected"; reason?: string; replay?: boolean }
export interface SyncReportRow extends SyncResultRow { studentName?: string | null; local: OutboxItem["local"]; at: number }

export const getScannerInfo = () => idb.get<{ scannerId: string; label: string; messId: string }>("kv", "scanner");
export const setScannerInfo = (v: { scannerId: string; label: string; messId: string }) => idb.put("kv", v, "scanner");
export const hasBundle = async () => !!(await idb.get<Wrapped>("kv", "bundle"));

export async function saveBundle(pin: string, bundle: Bundle): Promise<void> {
  await idb.put("kv", await wrapWithPin(pin, new TextEncoder().encode(JSON.stringify(bundle))), "bundle");
  await idb.put("kv", 0, "pinFailures");
}

export async function wipeBundle(): Promise<void> {
  await idb.del("kv", "bundle"); // outbox and ledger are deliberately kept: unsynced scans must survive
  await idb.del("kv", "pinFailures");
}

/** `wiped` = too many wrong PINs, the cached roster is gone and a new shift must be started online. */
export async function unlockBundle(pin: string): Promise<{ bundle: Bundle } | { error: "wrong_pin"; left: number } | { error: "wiped" } | { error: "none" }> {
  const wrapped = await idb.get<Wrapped>("kv", "bundle");
  if (!wrapped) return { error: "none" };
  const bytes = await unwrapWithPin(pin, wrapped);
  if (bytes) {
    await idb.put("kv", 0, "pinFailures");
    return { bundle: JSON.parse(new TextDecoder().decode(bytes)) as Bundle };
  }
  const fails = ((await idb.get<number>("kv", "pinFailures")) ?? 0) + 1;
  if (fails >= MAX_PIN_FAILURES) { await wipeBundle(); return { error: "wiped" }; }
  await idb.put("kv", fails, "pinFailures");
  return { error: "wrong_pin", left: MAX_PIN_FAILURES - fails };
}

export async function checkPin(pin: string): Promise<boolean> {
  const wrapped = await idb.get<Wrapped>("kv", "bundle");
  return !!wrapped && !!(await unwrapWithPin(pin, wrapped));
}

// ── ledger ──
export const ledgerGet = (key: string) => idb.get<LedgerEntry>("ledger", key);
export const ledgerPut = (e: LedgerEntry) => idb.put("ledger", e);
export async function ledgerManual(): Promise<LedgerEntry[]> { return (await idb.all<LedgerEntry>("ledger")).filter((e) => e.method === "manual"); }
export async function ledgerPrune(nowMs: number): Promise<void> {
  for (const e of await idb.all<LedgerEntry>("ledger")) if (nowMs - e.scannedAt > LEDGER_KEEP_MS) await idb.del("ledger", e.key);
}

// ── outbox ──
export const outboxPut = (i: OutboxItem) => idb.put("outbox", i);
export const outboxAll = () => idb.all<OutboxItem>("outbox");
export const outboxCount = async () => (await outboxAll()).length;

export type SyncOutcome =
  | { kind: "ok"; rows: SyncReportRow[] }
  | { kind: "offline" }
  | { kind: "auth" }
  | { kind: "error"; status: number };

/** Sends the outbox in batches of 200. Network failure leaves everything queued. */
export async function syncOutbox(scannerId: string, nowMs = Date.now()): Promise<SyncOutcome> {
  const items = (await outboxAll()).sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
  const rows: SyncReportRow[] = [];
  for (let i = 0; i < items.length; i += 200) {
    const batch = items.slice(i, i + 200);
    let res: Response;
    try {
      res = await fetch("/api/scanner/sync", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ scannerId, scans: batch.map((b) => ({ id: b.id, method: b.method, scanned_at: b.scanned_at, token: b.token, roll_number: b.roll_number, reason_code: b.reason_code, note: b.note })) }),
      });
    } catch { return { kind: "offline" }; }
    if (res.status === 401 || res.status === 403) return { kind: "auth" };
    if (!res.ok) return { kind: "error", status: res.status };
    const { results } = (await res.json()) as { results: SyncResultRow[] };
    const byId = new Map(batch.map((b) => [b.id, b]));
    for (const r of results) {
      const it = byId.get(r.id);
      rows.push({ ...r, studentName: it?.studentName, local: it?.local ?? "rejected", at: nowMs });
      await idb.del("outbox", r.id);
    }
  }
  return { kind: "ok", rows };
}
