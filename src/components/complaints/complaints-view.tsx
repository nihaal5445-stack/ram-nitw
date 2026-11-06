"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, EyeOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fileComplaint } from "@/app/actions/complaints";
import { CATEGORIES } from "@/lib/complaints/group";
import { cn } from "@/lib/utils";

export interface MyComplaint {
  id: string; mess: string; category: string; date: string; slot: string; body: string; anonymous: boolean;
  status: "open" | "in_progress" | "resolved" | "cannot_resolve"; reply: string | null; cannotReason: string | null;
  events: { kind: string; at: string; note: string | null }[];
}
const SLOTS = ["breakfast", "lunch", "snacks", "dinner"] as const;
const fmt = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function ComplaintsView({ messes, defaultMess, dates, complaints }: {
  messes: { id: string; name: string }[]; defaultMess: string; dates: string[]; complaints: MyComplaint[];
}) {
  const t = useTranslations("Complaints");
  const tm = useTranslations("Public.meals");
  const tl = useTranslations("Complaints.live");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState({ mess: defaultMess, category: "food_quality", date: dates[0], slot: "lunch", body: "", anonymous: false });
  const nameOf = (id: string) => messes.find((m) => m.id === id)?.name ?? id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await fileComplaint(f);
      if (r.ok) { setMsg({ ok: true, text: t("filed") }); setF({ ...f, body: "" }); router.refresh(); } else setMsg({ ok: false, text: r.error });
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form onSubmit={submit} className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2" aria-label={t("formLabel")}>
        <div><Label htmlFor="c-mess">{t("mess")}</Label>
          <select id="c-mess" className={selectCls} value={f.mess} onChange={(e) => setF({ ...f, mess: e.target.value })}>{messes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="goes-to">{tl("goesTo", { mess: nameOf(f.mess) })}</p></div>
        <div><Label htmlFor="c-cat">{t("category")}</Label>
          <select id="c-cat" className={selectCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</select></div>
        <div><Label htmlFor="c-date">{t("date")}</Label>
          <select id="c-date" className={selectCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>{dates.map((d, i) => <option key={d} value={d}>{i === 0 ? t("today") : d}</option>)}</select></div>
        <div><Label htmlFor="c-slot">{t("meal")}</Label>
          <select id="c-slot" className={selectCls} value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>{SLOTS.map((s) => <option key={s} value={s}>{tm(s)}</option>)}</select></div>
        <div className="sm:col-span-2"><Label htmlFor="c-body">{t("what")}</Label>
          <textarea id="c-body" required minLength={10} maxLength={1000} rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })}
            className="w-full rounded-md border border-input bg-background p-3 text-sm" placeholder={t("placeholder")} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} />
          <EyeOff className="size-4" aria-hidden /> {t("anonymous")}
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("anonymousNote")}</p>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>{t("submit")}</Button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={cn("text-sm", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
        </div>
      </form>

      <section aria-labelledby="mine">
        <h2 id="mine" className="text-lg font-semibold">{t("mine")}</h2>
        {complaints.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("none")}</p> : (
          <ul className="mt-3 space-y-4">
            {complaints.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card p-4" data-testid="my-complaint">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{t(`cat.${c.category}`)} · {nameOf(c.mess)} · {tm(c.slot as "lunch")} · {c.date}</p>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", c.status === "resolved" ? "bg-success/15 text-success" : c.status === "cannot_resolve" ? "bg-destructive/15 text-destructive" : c.status === "in_progress" ? "bg-secondary/20" : "bg-warning/25")}>
                    {t(`status.${c.status}`)}
                  </span>
                </div>
                <p className="mt-2 text-sm">{c.body}{c.anonymous && <span className="ml-2 text-xs text-muted-foreground">({t("anonTag")})</span>}</p>
                <ol className="mt-3 space-y-2 border-l border-border pl-4 text-sm" aria-label={t("timeline")}>
                  {c.events.filter((e) => e.kind !== "posted" && e.kind !== "replied").map((e) => (
                    <li key={e.kind + e.at} className="relative">
                      <span className="absolute -left-[1.35rem] top-0.5 bg-card">
                        {e.kind === "in_progress" ? <Circle className="size-4 text-secondary" aria-hidden /> : e.kind === "resolved" ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : e.kind === "cannot_resolve" ? <XCircle className="size-4 text-destructive" aria-hidden /> : <CheckCircle2 className="size-4 text-primary" aria-hidden />}
                      </span>
                      <span className="font-medium">{t(`event.${e.kind}`)}</span> <span className="text-muted-foreground">· {fmt(e.at)}</span>
                      {e.kind === "cannot_resolve" && c.cannotReason && <p className="text-muted-foreground">{t("reason")}: {c.cannotReason}</p>}
                    </li>
                  ))}
                  {(c.status === "open" || c.status === "in_progress") && (
                    <li className="relative text-muted-foreground"><span className="absolute -left-[1.35rem] top-0.5 bg-card"><Circle className="size-4" aria-hidden /></span>{t("awaiting")}</li>
                  )}
                </ol>
                {c.reply && (
                  <blockquote className="mt-3 rounded-md bg-muted/60 p-3 text-sm"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("replyFromAdmin")}</p>{c.reply}</blockquote>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
