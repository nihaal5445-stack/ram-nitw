"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Smartphone, WifiOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { classifyEnrollError, enrollThisDevice, forgetDevice, getStoredDevice, type StoredDevice } from "@/lib/access/device";
import { signToken, stepAt, STEP_SECONDS } from "@/lib/access/token";
import { QrCode } from "./qr-code";

export interface ServerDevice { id: string; device_key: string; label: string | null; created_at: string }

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

function guessLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  return "Browser";
}

export function TokenView({ serverDevice, debug = false }: { serverDevice: ServerDevice | null; debug?: boolean }) {
  const t = useTranslations("Access.token");
  const router = useRouter();
  const [local, setLocal] = useState<StoredDevice | null | undefined>(undefined); // undefined = still loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [skewMs, setSkewMs] = useState(0);
  const [skewKnown, setSkewKnown] = useState(false);
  const [online, setOnline] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const lastStep = useRef<number>(-1);

  // load this phone's key
  useEffect(() => { getStoredDevice().then((d) => setLocal(d ?? null)).catch(() => setLocal(null)); }, []);

  // tick: 4x/second normally, once a second when the user prefers reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), reduceMotion ? 1000 : 250);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // online status + clock check against the server clock (midpoint of the round trip)
  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const check = async () => {
      try {
        const t0 = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" });
        const { now: serverNow } = await res.json();
        const t1 = Date.now();
        if (!cancelled) { setSkewMs(serverNow - (t0 + t1) / 2); setSkewKnown(true); }
      } catch { /* offline or blocked: keep the last known skew */ }
    };
    check();
    const id = setInterval(check, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [online]);

  // keep the screen awake while the code is visible (best effort)
  useEffect(() => {
    if (!local) return;
    let lock: WakeLockSentinel | null = null;
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLockSentinel> } }).wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [local]);

  const corrected = now + skewMs;
  const step = stepAt(corrected);

  // sign a fresh token whenever the 30 s step changes (works fully offline)
  useEffect(() => {
    if (!local || lastStep.current === step) return;
    lastStep.current = step;
    signToken(local.privateKey, local.deviceKey, corrected).then(setToken).catch(() => setError(t("signFailed")));
  }, [local, step, corrected, t]);

  const secondsLeft = STEP_SECONDS - ((corrected / 1000) % STEP_SECONDS);
  const replaced = !!local && (!serverDevice || serverDevice.device_key !== local.deviceKey);
  const otherDeviceActive = !local && !!serverDevice;

  const enroll = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const d = await enrollThisDevice(createClient(), guessLabel());
      lastStep.current = -1; setToken(null); setLocal(d);
      router.refresh();
    } catch (e) {
      const kind = classifyEnrollError(e instanceof Error ? e.message : "");
      setError(t(`errors.${kind}`));
    } finally { setBusy(false); }
  }, [router, t]);

  const revoke = useCallback(async () => {
    if (!serverDevice) return;
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc("revoke_device", { p_device_id: serverDevice.id, p_reason: "revoked by student" });
    if (err) setError(t("errors.unknown"));
    else {
      if (local && local.deviceKey === serverDevice.device_key) { await forgetDevice(); setLocal(null); setToken(null); lastStep.current = -1; }
      router.refresh();
    }
    setBusy(false);
  }, [serverDevice, local, router, t]);

  if (local === undefined) return <div className="h-96 animate-pulse rounded-lg bg-muted" aria-busy="true" />;

  // ── not enrolled on this phone ──
  if (!local) {
    return (
      <section className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <Smartphone className="mx-auto size-10 text-brand" strokeWidth={1.5} aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold">{t("enrollTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("enrollBody")}</p>
        {otherDeviceActive && (
          <p role="note" className="mt-4 rounded-md bg-surface-2 p-3 text-sm">
            {t("otherDevice", { label: serverDevice?.label ?? "-" })}
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <Button onClick={enroll} disabled={busy} className="mt-6 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? t("enrolling") : otherDeviceActive ? t("enrollReplace") : t("enrollButton")}
        </Button>
      </section>
    );
  }

  // ── enrolled here, but the server says this is no longer the active device ──
  if (replaced) {
    return (
      <section className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" strokeWidth={1.5} aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold">{t("replacedTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("replacedBody")}</p>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <Button onClick={async () => { await forgetDevice(); setLocal(null); }} className="mt-6 h-11 w-full" variant="outline">{t("enrollAgain")}</Button>
      </section>
    );
  }

  // ── active device: show the rotating QR ──
  const clockOff = skewKnown && Math.abs(skewMs) > 10_000;
  return (
    <div className="mx-auto max-w-md space-y-4">
      {!online && (
        <p className="flex items-center justify-center gap-2 rounded-md bg-surface-2 p-2 text-sm" role="status">
          <WifiOff className="size-4" aria-hidden /> {t("offlineOk")}
        </p>
      )}
      {clockOff && (
        <p role="alert" className="flex gap-2 rounded-md border border-warning p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t("clockOff", { seconds: Math.round(Math.abs(skewMs) / 1000) })}
        </p>
      )}
      <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="qr-title">
        <h2 id="qr-title" className="sr-only">{t("title")}</h2>
        <div className="relative mx-auto aspect-square w-full max-w-[20rem]" data-testid="qr-token" data-token={token ?? ""}>
          {token ? <QrCode text={token} label={t("qrLabel")} className="h-full w-full rounded-md" /> : <div className="h-full w-full animate-pulse rounded-md bg-muted" />}
        </div>
        <div className="mt-5 flex items-center justify-center gap-4">
          <svg viewBox="0 0 120 120" className="size-14 -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={RING_R} fill="none" className="stroke-muted" strokeWidth="8" />
            <circle cx="60" cy="60" r={RING_R} fill="none" className="stroke-brand" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - secondsLeft / STEP_SECONDS)} />
          </svg>
          <p className="text-sm" role="timer" aria-live="off">
            <span className="block font-display text-2xl font-semibold tabular-nums">{Math.ceil(secondsLeft)} s</span>
            <span className="text-muted-foreground">{t("refreshesIn")}</span>
          </p>
        </div>
      </section>
      {debug && token && (
        <div className="rounded-md border border-dashed border-border p-3" data-testid="debug-token">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("debugTitle")}</p>
          <code className="mt-1 block break-all text-xs">{token}</code>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => navigator.clipboard?.writeText(token)}>{t("debugCopy")}</Button>
        </div>
      )}
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li>{t("tipBrightness")}</li>
        <li>{t("tipScreenshot")}</li>
      </ul>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
        <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" aria-hidden />{t("deviceActive", { label: local.label })}</span>
        <Button variant="outline" size="sm" onClick={revoke} disabled={busy}>{t("revoke")}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
