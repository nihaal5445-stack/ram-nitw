"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FlaskConical, Star } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FEEDBACK_EVENT, useFeedbackPrompts, type FeedbackPrompt } from "./use-feedback";

const messName = (id: string) => ({ "ifc-a": "IFC-A", "ifc-b": "IFC-B", krishna: "Krishna Mess", priyadarshini: "Priyadarshini Mess" }[id] ?? id);

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTranslations("Feedback");
  return (
    <div role="radiogroup" aria-label={t("stars")} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t("starN", { n })} onClick={() => onChange(n)} className="rounded p-1 hover:bg-muted">
          <Star className={cn("size-7", n <= value ? "fill-gold text-gold" : "text-muted-foreground/50")} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function PromptCard({ p, skippable, onDone }: { p: FeedbackPrompt; skippable: boolean; onDone: (msg: string) => void }) {
  const t = useTranslations("Feedback");
  const tm = useTranslations("Public.meals");
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [improve, setImprove] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supabase = createClient();

  const submit = async () => {
    if (!stars) { setErr(t("pickStars")); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("submit_feedback", { p_redemption: p.redemption_id, p_stars: stars, p_review: review, p_improve: improve });
    setBusy(false);
    if (error) { setErr(t("failed")); return; }
    onDone(t("thanks"));
  };
  const skip = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("skip_feedback", { p_redemption: p.redemption_id });
    setBusy(false);
    if (error) { setErr(t("notSkippable")); return; }
    onDone(data === "snoozed" ? t("snoozed") : t("skipped"));
  };

  return (
    <li className="space-y-4 rounded-lg border-2 border-primary/30 bg-card p-4" data-testid="feedback-card">
      <h2 className="text-lg font-semibold">{t("howWas", { meal: tm(p.slot as "lunch"), mess: messName(p.mess_id) })}</h2>
      <Stars value={stars} onChange={setStars} />
      <div><Label htmlFor={`rv-${p.redemption_id}`}>{t("review")}</Label>
        <textarea id={`rv-${p.redemption_id}`} rows={3} maxLength={1000} value={review} onChange={(e) => setReview(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm" /></div>
      <div><Label htmlFor={`im-${p.redemption_id}`}>{t("improve")}</Label>
        <textarea id={`im-${p.redemption_id}`} rows={2} maxLength={1000} value={improve} onChange={(e) => setImprove(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm" /></div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={submit} data-testid="submit-feedback">{t("submit")}</Button>
        {skippable && <Button variant="outline" disabled={busy} onClick={skip} data-testid="skip-feedback">{t("skip")}</Button>}
      </div>
    </li>
  );
}

export function FeedbackView() {
  const t = useTranslations("Feedback");
  const { prompts, refresh } = useFeedbackPrompts();
  const [prefs, setPrefs] = useState<{ skippable: boolean; remind_once: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    createClient().rpc("get_feedback_prefs").then(({ data }) => { if (live && data) setPrefs(data as { skippable: boolean; remind_once: boolean }); });
    return () => { live = false; };
  }, []);

  const savePrefs = async (next: { skippable: boolean; remind_once: boolean }) => {
    setPrefs(next);
    await createClient().rpc("set_feedback_prefs", { p_skippable: next.skippable, p_remind_once: next.remind_once });
  };
  const changed = async (msg: string) => { setNote(msg); window.dispatchEvent(new Event(FEEDBACK_EVENT)); await refresh(); };
  const simulate = async () => {
    const { data } = await createClient().rpc("simulate_feedback_due");
    setNote(data ? t("simulated") : t("simulateNone"));
    window.dispatchEvent(new Event(FEEDBACK_EVENT));
    await refresh();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      {note && <p role="status" className="rounded-md border border-border bg-muted/50 p-3 text-sm" data-testid="feedback-note">{note}</p>}

      {prompts.length === 0 ? <p className="text-muted-foreground" data-testid="feedback-none">{t("none")}</p> : (
        <ul className="space-y-4">{prompts.map((p) => <PromptCard key={p.redemption_id} p={p} skippable={prefs?.skippable ?? true} onDone={changed} />)}</ul>
      )}

      <section aria-labelledby="fb-settings" className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 id="fb-settings" className="font-semibold">{t("settings")}</h2>
        {prefs && (
          <>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={prefs.skippable} onChange={(e) => savePrefs({ ...prefs, skippable: e.target.checked })} data-testid="pref-skippable" /><span><span className="font-medium">{t("prefSkippable")}</span><br /><span className="text-muted-foreground">{t("prefSkippableDesc")}</span></span></label>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={prefs.remind_once} onChange={(e) => savePrefs({ ...prefs, remind_once: e.target.checked })} data-testid="pref-remind" /><span><span className="font-medium">{t("prefRemind")}</span><br /><span className="text-muted-foreground">{t("prefRemindDesc")}</span></span></label>
          </>
        )}
      </section>

      <section aria-labelledby="fb-demo" className="rounded-lg border border-dashed border-border p-4">
        <h2 id="fb-demo" className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="size-4" aria-hidden />{t("demoTool")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("demoToolDesc")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={simulate} data-testid="simulate-40">{t("simulate")}</Button>
      </section>
    </div>
  );
}
