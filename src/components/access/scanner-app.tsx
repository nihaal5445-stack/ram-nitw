"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Keyboard, Lock, RefreshCw, ShieldAlert, WifiOff, XCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { evaluateManual, evaluateQr, makeContext, MANUAL_REASONS, type Bundle, type Outcome, type ScanContext } from "@/lib/access/scanner-core";
import { ledgerKey } from "@/lib/access/slots";
import { evaluateAddonTicket } from "@/lib/access/addon-ticket";
import {
  checkPin, getScannerInfo, ledgerGet, ledgerManual, ledgerPrune, ledgerPut, outboxCount, outboxPut, saveBundle,
  setScannerInfo, syncOutbox, unlockBundle, wipeBundle, hasBundle, type OutboxItem, type SyncReportRow,
} from "@/lib/access/scanner-store";

type Phase = "loading" | "setup" | "locked" | "ready";
interface Shown { tone: "ok" | "bad" | "warn"; title: string; detail?: string; at: number }

const IDLE_LOCK_MS = 10 * 60_000;
const REFRESH_MS = 10 * 60_000;
const SYNC_MS = 30_000;
// Rejected scans worth telling the server about (it flags them); the rest are just local feedback.
const REPORTABLE = new Set(["stale", "future", "bad_signature", "unknown_device", "revoked_device", "duplicate"]);

const uuid = () => crypto.randomUUID();
/** Adds the server's add-on public key to a fresh bundle; keeps the previous one when offline. */
async function withAddonKey(b: Bundle, previous: string | null | undefined): Promise<Bundle> {
  try {
    const r = await fetch("/api/addons/key", { cache: "no-store" });
    if (r.ok) return { ...b, addon_key: ((await r.json()) as { public_key: string }).public_key };
  } catch { /* offline */ }
  return previous ? { ...b, addon_key: previous } : b;
}
const hhmm = (ms: number) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hour12: false }).format(ms);

export function ScannerApp({ messName, debug }: { messName: string; debug: boolean }) {
  const t = useTranslations("Access.scanner");
  const tm = useTranslations("Public.meals");

  const [phase, setPhase] = useState<Phase>("loading");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [skewMs, setSkewMs] = useState(0);
  const [skewKnown, setSkewKnown] = useState(false);
  const [pending, setPending] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<Shown[]>([]);
  const [report, setReport] = useState<SyncReportRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const [cameraState, setCameraState] = useState<"starting" | "on" | "unavailable">("starting");

  const ctxRef = useRef<ScanContext | null>(null);
  const pinRef = useRef<string>("");
  const scannerIdRef = useRef<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastText = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const lastActivity = useRef(0);
  const skewRef = useRef(0);
  const syncingRef = useRef(false);
  const resyncRef = useRef(false); // a scan arrived while a sync was running: sync again right after

  const nowMs = () => Date.now() + skewRef.current;
  const touch = () => { lastActivity.current = Date.now(); };

  const refreshPending = useCallback(async () => setPending(await outboxCount()), []);

  // ── initial state ──
  useEffect(() => {
    (async () => {
      const info = await getScannerInfo();
      if (info) scannerIdRef.current = info.scannerId;
      setPhase((await hasBundle()) ? "locked" : "setup");
      refreshPending();
    })().catch(() => setPhase("setup"));
  }, [refreshPending]);

  // ── online / clock ──
  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd); window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  useEffect(() => {
    if (!online) return;
    let dead = false;
    const check = async () => {
      try {
        const t0 = Date.now();
        const { now } = await (await fetch("/api/time", { cache: "no-store" })).json();
        const t1 = Date.now();
        if (!dead) { skewRef.current = now - (t0 + t1) / 2; setSkewMs(skewRef.current); setSkewKnown(true); }
      } catch { /* keep last */ }
    };
    check();
    const id = setInterval(check, 5 * 60_000);
    return () => { dead = true; clearInterval(id); };
  }, [online]);

  // ── lock ──
  const lock = useCallback(() => {
    pinRef.current = ""; ctxRef.current = null; setBundle(null); setShown(null); setManualOpen(false); setPhase("locked");
  }, []);

  // ── sync ──
  const runSync = useCallback(async () => {
    if (!scannerIdRef.current) return;
    if (syncingRef.current) { resyncRef.current = true; return; }
    syncingRef.current = true; setSyncing(true); setSyncNote(null);
    try {
      const out = await syncOutbox(scannerIdRef.current, nowMs());
      if (out.kind === "ok") {
        if (out.rows.length) setReport((r) => [...out.rows, ...r].slice(0, 30));
        setLastSync(Date.now());
      } else if (out.kind === "auth") setSyncNote(t("ready.syncAuth"));
      else if (out.kind === "error") setSyncNote(t("ready.syncError", { status: out.status }));
    } finally {
      syncingRef.current = false; setSyncing(false); refreshPending();
      if (resyncRef.current && navigator.onLine) { resyncRef.current = false; setTimeout(() => void runSyncRef.current(), 0); }
    }
  }, [refreshPending, t]);
  const runSyncRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { runSyncRef.current = runSync; }, [runSync]);

  useEffect(() => {
    if (phase !== "ready" && phase !== "locked") return;
    if (online) runSync();
    const id = setInterval(() => { if (navigator.onLine) runSync(); }, SYNC_MS);
    return () => clearInterval(id);
  }, [phase, online, runSync]);

  // ── start a shift (online): register scanner if needed, download the roster ──
  const startShift = useCallback(async (pin: string, label: string) => {
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      let info = await getScannerInfo();
      const register = async () => {
        const { data, error: e } = await supabase.rpc("register_scanner", { p_label: label });
        if (e) throw new Error(e.message);
        info = { scannerId: data as string, label, messId: "" };
        await setScannerInfo(info);
      };
      if (!info) await register();
      let res = await supabase.rpc("issue_scanner_bundle", { p_scanner_id: info!.scannerId });
      if (res.error?.message.includes("not authorized")) { await register(); res = await supabase.rpc("issue_scanner_bundle", { p_scanner_id: info!.scannerId }); }
      if (res.error) throw new Error(res.error.message);
      const b = await withAddonKey(res.data as Bundle, null);
      await setScannerInfo({ scannerId: b.scanner_id, label: info!.label, messId: b.mess_id });
      await saveBundle(pin, b);
      scannerIdRef.current = b.scanner_id; pinRef.current = pin;
      ctxRef.current = makeContext(b, ledgerGet, ledgerManual);
      touch(); setBundle(b); setPhase("ready");
    } catch (e) {
      setError(e instanceof Error && /fetch|network/i.test(e.message) ? t("setup.needOnline") : t("setup.error"));
    } finally { setBusy(false); }
  }, [t]);

  const unlock = useCallback(async (pin: string) => {
    setBusy(true); setError(null);
    const r = await unlockBundle(pin);
    setBusy(false);
    if ("bundle" in r) {
      pinRef.current = pin; ctxRef.current = makeContext(r.bundle, ledgerGet, ledgerManual);
      touch(); setBundle(r.bundle); setPhase("ready"); ledgerPrune(Date.now());
    } else if (r.error === "wrong_pin") setError(t("locked.wrongPin", { left: r.left }));
    else if (r.error === "wiped") { setError(t("locked.wiped")); setPhase("setup"); }
  }, [t]);

  // ── handle one decoded QR text ──
  const show = useCallback((s: Omit<Shown, "at">) => {
    const full = { ...s, at: Date.now() };
    setShown(full); setRecent((r) => [full, ...r].slice(0, 8));
    navigator.vibrate?.(s.tone === "ok" ? 60 : [120, 60, 120]);
  }, []);

  const describe = useCallback((o: Outcome): Omit<Shown, "at"> => {
    if (o.ok) return { tone: "ok", title: t("result.admitted", { name: o.student.name ?? "—" }), detail: `${tm(o.slot as "lunch")} · ${o.student.roll ?? ""}` };
    const who = o.student?.name ?? "";
    if (o.reason === "duplicate") return { tone: "bad", title: t("result.duplicate", { name: who }), detail: t("result.duplicateAt", { time: hhmm((o as { firstAt: number }).firstAt) }) };
    const tone = ["bundle_expired", "outside_meal_time", "malformed"].includes(o.reason) ? "warn" : "bad";
    return { tone, title: t(`result.${o.reason}`), detail: who || undefined };
  }, [t, tm]);

  const handleText = useCallback(async (raw: string) => {
    const ctx = ctxRef.current;
    const text = raw.trim();
    if (!ctx || !text) return;
    const prev = lastText.current;
    if (prev.text === text && Date.now() - prev.at < 2500) return; // camera sees the same frame repeatedly
    lastText.current = { text, at: Date.now() };
    touch();
    const now = nowMs();
    if (text.startsWith("ramA.")) {
      const ao = await evaluateAddonTicket(text, ctx.bundle.addon_key, ctx.bundle.mess_id, ctx.bundle.slots, now, async (id) => !!(await ledgerGet(`addon|${id}`)), ctx.bundle.demo_mode === true);
      if (ao.ok) {
        const p = ao.payload;
        await ledgerPut({ key: `addon|${p.i}`, studentId: "addon", slot: p.s, date: p.d, scannedAt: now, method: "qr", scanId: p.i });
        await outboxPut({ id: uuid(), method: "addon", token: text, scanned_at: new Date(now).toISOString(), local: "admitted", studentName: p.u });
        show({ tone: "ok", title: p.k === "pass" ? t("result.passOk", { name: p.u }) : t("result.addonOk", { item: p.n }), detail: p.k === "pass" ? t("result.passFrom", { mess: p.n }) + ` · ${tm(p.s as "lunch")}` : `${p.u} · ${tm(p.s as "lunch")}` });
      } else {
        show({ tone: ao.reason === "addon_wrong_slot" ? "warn" : "bad", title: t(`result.${ao.reason}`), detail: ao.payload ? `${ao.payload.n} · ${ao.payload.u}` : undefined });
      }
      await refreshPending();
      if (navigator.onLine) runSync();
      return;
    }
    const out = await evaluateQr(text, ctx, now);
    const base = { method: "qr" as const, token: text, scanned_at: new Date(now).toISOString(), studentName: out.ok || out.student ? (out.ok ? out.student.name : out.student?.name) : null };
    if (out.ok) {
      const scanId = uuid();
      await ledgerPut({ key: ledgerKey(out.student.student_id, out.date, out.slot), studentId: out.student.student_id, slot: out.slot, date: out.date, scannedAt: now, method: "qr", scanId });
      await outboxPut({ id: scanId, ...base, local: "admitted" } as OutboxItem);
    } else if (REPORTABLE.has(out.reason)) {
      await outboxPut({ id: uuid(), ...base, local: out.reason === "duplicate" ? "duplicate" : "rejected" } as OutboxItem);
    }
    show(describe(out));
    await refreshPending();
    if (navigator.onLine) runSync();
  }, [describe, refreshPending, runSync, show, t, tm]);

  // ── camera ──
  const handleRef = useRef(handleText);
  useEffect(() => { handleRef.current = handleText; }, [handleText]);
  useEffect(() => {
    if (phase !== "ready" || !videoRef.current) return;
    let scanner: { start(): Promise<void>; stop(): void; destroy(): void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;
        const s = new QrScanner(videoRef.current, (r) => handleRef.current(r.data), {
          preferredCamera: "environment", maxScansPerSecond: 5, returnDetailedScanResult: true, highlightScanRegion: true,
        });
        scanner = s;
        await s.start();
        if (!cancelled) setCameraState("on");
      } catch { if (!cancelled) setCameraState("unavailable"); }
    })();
    return () => { cancelled = true; scanner?.stop(); scanner?.destroy(); };
  }, [phase]);

  // ── bundle expiry (checked on a timer so render stays pure) ──
  useEffect(() => {
    if (!bundle) return;
    const check = () => setExpired(Date.now() > Date.parse(bundle.expires_at));
    const first = setTimeout(check, 0);
    const id = setInterval(check, 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [bundle]);

  // ── idle auto-lock + periodic roster refresh (picks up revocations) ──
  useEffect(() => {
    if (phase !== "ready") return;
    const idle = setInterval(() => { if (Date.now() - lastActivity.current > IDLE_LOCK_MS) lock(); }, 15_000);
    const refresh = setInterval(async () => {
      if (!navigator.onLine || !pinRef.current) return;
      const { data, error: e } = await createClient().rpc("issue_scanner_bundle", { p_scanner_id: scannerIdRef.current });
      if (e || !data) return;
      const b = await withAddonKey(data as Bundle, ctxRef.current?.bundle.addon_key);
      await saveBundle(pinRef.current, b);
      ctxRef.current = makeContext(b, ledgerGet, ledgerManual);
      setBundle(b);
    }, REFRESH_MS);
    const act = () => touch();
    window.addEventListener("pointerdown", act); window.addEventListener("keydown", act);
    return () => { clearInterval(idle); clearInterval(refresh); window.removeEventListener("pointerdown", act); window.removeEventListener("keydown", act); };
  }, [phase, lock]);

  // ── manual entry ──
  const submitManual = useCallback(async (v: { roll: string; reason: string; note: string; pin: string }): Promise<string | null> => {
    if (!(await checkPin(v.pin))) return t("ready.manual.wrongPin");
    const ctx = ctxRef.current;
    if (!ctx) return t("setup.error");
    const now = nowMs();
    const out = await evaluateManual(v.roll, v.reason, v.note, ctx, now);
    if (out.ok) {
      const scanId = uuid();
      await ledgerPut({ key: ledgerKey(out.student.student_id, out.date, out.slot), studentId: out.student.student_id, slot: out.slot, date: out.date, scannedAt: now, method: "manual", scanId });
      await outboxPut({ id: scanId, method: "manual", scanned_at: new Date(now).toISOString(), roll_number: v.roll.trim(), reason_code: v.reason, note: v.note.trim() || undefined, local: "admitted", studentName: out.student.name });
      show({ tone: "ok", title: t("result.admittedManual", { name: out.student.name ?? "—" }), detail: `${tm(out.slot as "lunch")} · ${out.student.roll ?? ""}` });
      refreshPending(); if (navigator.onLine) runSync();
      setManualOpen(false);
      return null;
    }
    return describe(out).title;
  }, [describe, refreshPending, runSync, show, t, tm]);

  // ── render ──
  if (phase === "loading") return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (phase === "setup") return <SetupForm t={t} messName={messName} busy={busy} error={error} online={online} pending={pending} onStart={startShift} />;
  if (phase === "locked") return <LockedForm t={t} busy={busy} error={error} pending={pending} online={online} onUnlock={unlock} onNewShift={async () => { await wipeBundle(); setError(null); setPhase("setup"); }} />;

  const clockOff = skewKnown && Math.abs(skewMs) > 10_000;
  const toneClass = { ok: "border-success bg-success text-white", bad: "border-destructive bg-destructive text-destructive-foreground", warn: "border-warning bg-warning text-white dark:text-black" } as const;
  const ToneIcon = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle } as const;
  const crossDup = report.filter((r) => r.status === "duplicate" && r.local === "admitted");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-border px-3 py-1 font-medium">{messName}</span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1", online ? "bg-success/15" : "bg-warning/15")} role="status">
          {online ? t("ready.online") : <><WifiOff className="size-3.5" aria-hidden />{t("ready.offline")}</>}
        </span>
        <span className="rounded-full bg-surface-2 px-3 py-1">{t("ready.pending", { n: pending })}</span>
        {bundle && <span className="rounded-full bg-surface-2 px-3 py-1">{t("ready.shiftUntil", { time: hhmm(Date.parse(bundle.expires_at)) })}</span>}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={runSync} disabled={syncing || !online}><RefreshCw className={cn("size-4", syncing && "motion-safe:animate-spin")} aria-hidden />{syncing ? t("ready.syncing") : t("ready.sync")}</Button>
          <Button size="sm" variant="outline" onClick={lock}><Lock className="size-4" aria-hidden />{t("ready.lock")}</Button>
        </span>
      </div>

      {expired && <p role="alert" className="rounded-md border border-warning p-3 text-sm">{t("result.bundle_expired")}</p>}
      {clockOff && <p role="alert" className="rounded-md border border-warning p-3 text-sm">{t("ready.clockOff", { seconds: Math.round(Math.abs(skewMs) / 1000) })}</p>}
      {syncNote && <p role="alert" className="rounded-md border border-warning p-3 text-sm">{syncNote}</p>}
      {crossDup.length > 0 && (
        <p role="alert" className="flex gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{t("ready.report.crossDuplicate", { names: crossDup.map((r) => r.studentName ?? "—").join(", ") })}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="order-2 lg:order-none">
          <div className="relative aspect-square max-h-[62vh] w-full overflow-hidden rounded-lg border border-border bg-muted sm:aspect-[4/3]" data-testid="camera-box">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label={t("ready.camera.label")} />
            {cameraState !== "on" && (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {cameraState === "starting" ? t("ready.camera.starting") : t("ready.camera.unavailable")}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setManualOpen(true)}><Keyboard className="size-4" aria-hidden />{t("ready.manual.open")}</Button>
          </div>
          {debug && <DebugInput t={t} onSubmit={handleText} />}
        </div>

        <div className="contents lg:block lg:space-y-3">
          <div role="status" aria-live="assertive" className={cn("order-1 min-h-44 rounded-lg border-4 p-5 sm:min-h-40 lg:order-none lg:border-2", shown ? toneClass[shown.tone] : "border-dashed border-border")} data-testid="scan-result" data-tone={shown?.tone ?? "idle"}>
            {shown ? (() => { const I = ToneIcon[shown.tone]; return (
              <div className="flex items-start gap-3">
                <I className="mt-1 size-12 shrink-0 sm:size-8" strokeWidth={2} aria-hidden />
                <div><p className="font-display text-3xl font-semibold leading-tight sm:text-2xl" data-testid="scan-title">{shown.title}</p>{shown.detail && <p className="mt-1 text-lg font-semibold opacity-95">{shown.detail}</p>}</div>
              </div>); })() : <p className="text-muted-foreground">{t("ready.camera.hint")}</p>}
          </div>
          <div className="order-3 lg:order-none">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("ready.recent")}</h3>
            {recent.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("ready.noScans")}</p> : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {recent.map((r) => (
                  <li key={r.at} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate">{r.title}</span>
                    <span className={cn("shrink-0 text-xs", r.tone === "ok" ? "text-success" : r.tone === "bad" ? "text-destructive" : "text-warning")}>{hhmm(r.at)}</span>
                  </li>))}
              </ul>)}
          </div>
          <div className="order-4 lg:order-none">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("ready.report.title")}{lastSync && <span className="ml-2 normal-case tracking-normal">{t("ready.lastSync", { time: hhmm(lastSync) })}</span>}</h3>
            {report.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("ready.report.none")}</p> : (
              <ul className="mt-2 divide-y divide-border text-sm" data-testid="sync-report">
                {report.slice(0, 8).map((r, i) => (
                  <li key={r.id + i} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate">{r.studentName ?? "—"}</span>
                    <span className={cn("shrink-0 text-xs", r.status === "accepted" ? "text-success" : "text-destructive")}>{t(`ready.report.${r.status}`)}{r.reason && r.status !== "accepted" ? ` (${r.reason})` : ""}</span>
                  </li>))}
              </ul>)}
          </div>
        </div>
      </div>

      {manualOpen && <ManualDialog t={t} onClose={() => setManualOpen(false)} onSubmit={submitManual} />}
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function SetupForm({ t, messName, busy, error, online, pending, onStart }: { t: T; messName: string; busy: boolean; error: string | null; online: boolean; pending: number; onStart: (pin: string, label: string) => void }) {
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState(""); const [label, setLabel] = useState("Counter laptop"); const [local, setLocal] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,12}$/.test(pin)) return setLocal(t("setup.tooShort"));
    if (pin !== pin2) return setLocal(t("setup.mismatch"));
    setLocal(null); onStart(pin, label.trim() || "Counter laptop");
  };
  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-2xl font-semibold">{t("setup.title")}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("setup.body", { mess: messName })}</p>
      {pending > 0 && <p className="rounded-md bg-surface-2 p-3 text-sm">{t("setup.pendingKept", { n: pending })}</p>}
      {!online && <p role="alert" className="rounded-md border border-warning p-3 text-sm">{t("setup.needOnline")}</p>}
      <div className="space-y-2"><Label htmlFor="label">{t("setup.label")}</Label><Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} className="h-11" /></div>
      <div className="space-y-2"><Label htmlFor="pin">{t("setup.pin")}</Label><Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} className="h-11" aria-describedby="pin-help" /><p id="pin-help" className="text-xs text-muted-foreground">{t("setup.pinRules")}</p></div>
      <div className="space-y-2"><Label htmlFor="pin2">{t("setup.pinConfirm")}</Label><Input id="pin2" type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} className="h-11" /></div>
      {(local || error) && <p role="alert" className="text-sm text-destructive">{local ?? error}</p>}
      <Button type="submit" disabled={busy || !online} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">{busy ? t("setup.starting") : t("setup.start")}</Button>
    </form>
  );
}

function LockedForm({ t, busy, error, pending, online, onUnlock, onNewShift }: { t: T; busy: boolean; error: string | null; pending: number; online: boolean; onUnlock: (pin: string) => void; onNewShift: () => void }) {
  const [pin, setPin] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onUnlock(pin); }} className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
      <Lock className="size-8 text-brand" strokeWidth={1.5} aria-hidden />
      <h2 className="font-display text-2xl font-semibold">{t("locked.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("locked.body")}</p>
      {pending > 0 && <p className="rounded-md bg-surface-2 p-3 text-sm">{t("locked.pending", { n: pending })}</p>}
      <div className="space-y-2"><Label htmlFor="unlock-pin">{t("locked.pin")}</Label><Input id="unlock-pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} className="h-11" /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !pin} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">{t("locked.unlock")}</Button>
      <Button type="button" variant="outline" className="w-full" disabled={!online} onClick={onNewShift}>{t("locked.newShift")}</Button>
    </form>
  );
}

function ManualDialog({ t, onClose, onSubmit }: { t: T; onClose: () => void; onSubmit: (v: { roll: string; reason: string; note: string; pin: string }) => Promise<string | null> }) {
  const [roll, setRoll] = useState(""); const [reason, setReason] = useState(""); const [note, setNote] = useState(""); const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(await onSubmit({ roll, reason, note, pin })); setBusy(false); };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="manual-title">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg bg-background p-6 shadow-xl">
        <h2 id="manual-title" className="font-display text-2xl font-semibold">{t("ready.manual.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("ready.manual.warning")}</p>
        <div className="space-y-2"><Label htmlFor="m-roll">{t("ready.manual.roll")}</Label><Input id="m-roll" value={roll} onChange={(e) => setRoll(e.target.value)} autoFocus className="h-11" /></div>
        <div className="space-y-2"><Label htmlFor="m-reason">{t("ready.manual.reason")}</Label>
          <select id="m-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("ready.manual.choose")}</option>
            {MANUAL_REASONS.map((r) => <option key={r} value={r}>{t(`ready.manual.reasons.${r}`)}</option>)}
          </select></div>
        <div className="space-y-2"><Label htmlFor="m-note">{t("ready.manual.note")}</Label><Input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" /></div>
        <div className="space-y-2"><Label htmlFor="m-pin">{t("ready.manual.pin")}</Label><Input id="m-pin" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} className="h-11" /></div>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t("ready.manual.cancel")}</Button>
          <Button type="submit" disabled={busy || !roll || !reason || !pin} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">{t("ready.manual.submit")}</Button>
        </div>
      </form>
    </div>
  );
}

function DebugInput({ t, onSubmit }: { t: T; onSubmit: (text: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); onSubmit(v); setV(""); }}>
      <Input aria-label={t("ready.debug.label")} placeholder={t("ready.debug.label")} value={v} onChange={(e) => setV(e.target.value)} className="h-10 font-mono text-xs" data-testid="debug-code" />
      <Button type="submit" variant="outline">{t("ready.debug.submit")}</Button>
    </form>
  );
}
