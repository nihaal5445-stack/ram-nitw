"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/access/qr-code";
import { useCrowd } from "@/components/site/use-crowd";
import { messes } from "@/config/messes";
import { getSwitchTicket, issueSwitchPass } from "@/app/actions/switch";

export interface MyPass { id: string; toMess: string; slot: string }

/** "Eat here this meal": quieter messes than the student's own, with a single-meal pass. */
export function SwitchMess({ ownMess, allowed, activePass }: { ownMess: string; allowed: boolean; activePass: MyPass | null }) {
  const t = useTranslations("Switch");
  const crowd = useCrowd();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ text: string; mess: string } | null>(null);
  const name = (id: string) => messes.find((m) => m.id === id)?.name ?? id;

  const show = (passId: string) => start(async () => {
    const r = await getSwitchTicket(passId);
    if (r.ok) setTicket({ text: r.ticket, mess: name(r.toMess) }); else setErr(t(`errors.${"default"}`));
  });
  const eat = (to: string) => start(async () => {
    setErr(null);
    const r = await issueSwitchPass(to);
    if (!r.ok) { setErr(t(`errors.${r.error}` as "errors.default")); return; }
    show(r.passId);
  });

  const own = crowd?.[ownMess];
  const options = messes.filter((m) => m.status === "confirmed" && m.id !== ownMess && m.id !== "priyadarshini")
    .map((m) => ({ m, row: crowd?.[m.id] })).filter((o) => o.row && o.row.level !== "closed" && own && o.row.pct < own.pct);

  return (
    <section aria-labelledby="sw-title" className="space-y-3 rounded-lg border border-border bg-card p-4" data-testid="switch-card">
      <h2 id="sw-title" className="flex items-center gap-2 font-semibold"><ArrowRightLeft className="size-4 text-primary" aria-hidden />{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("lead")}</p>
      {!allowed ? <p className="text-sm" data-testid="switch-off">{t("off")}</p> : (
        <>
          {own && <p className="text-sm">{t("yourMess")}: <b>{name(ownMess)}</b> · {t("crowd", { pct: own.pct })}</p>}
          {activePass && !ticket && <Button variant="outline" size="sm" onClick={() => show(activePass.id)} disabled={pending}>{t("active")}: {name(activePass.toMess)}</Button>}
          <ul className="space-y-2">
            {options.map(({ m, row }) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <span><span className="font-medium">{m.name}</span> <span className="text-sm text-muted-foreground">· {t("crowd", { pct: row!.pct })}</span></span>
                <Button size="sm" disabled={pending} onClick={() => eat(m.id)} data-testid={`eat-${m.id}`}>{t("eat")}</Button>
              </li>
            ))}
          </ul>
          {options.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
          <p className="text-xs text-muted-foreground">{t("needLess")}</p>
        </>
      )}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {ticket && (
        <div className="flex flex-col items-center gap-2 rounded-md border-2 border-primary/40 p-4" data-testid="pass-ticket" data-ticket={ticket.text}>
          <p className="font-semibold">{t("passTitle", { mess: ticket.mess })}</p>
          <QrCode text={ticket.text} label={t("passTitle", { mess: ticket.mess })} className="w-60 max-w-full rounded border border-border" />
          <p className="text-center text-sm text-muted-foreground">{t("passHelp", { mess: ticket.mess })}</p>
        </div>
      )}
    </section>
  );
}
