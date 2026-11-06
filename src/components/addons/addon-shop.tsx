"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, Receipt, ShieldAlert, Soup, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode } from "@/components/access/qr-code";
import { buyAddon, getAddonTicket } from "@/app/actions/addons";
import { cn } from "@/lib/utils";

export interface ShopAddon { id: string; name: string; pricePaise: number; left: number }
export interface ShopPurchase { id: string; name: string; date: string; slot: string; amountPaise: number; ref: string; status: "paid" | "redeemed"; at: string }

const rupees = (p: number) => `Rs ${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

export function AddonShop({ addons, purchases, messAssigned, debug }: { addons: ShopAddon[]; purchases: ShopPurchase[]; messAssigned: boolean; debug?: boolean }) {
  const t = useTranslations("Addons");
  const tm = useTranslations("Public.meals");
  const router = useRouter();
  const [paying, setPaying] = useState<ShopAddon | null>(null);
  const [ticket, setTicket] = useState<{ text: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const showTicket = (purchaseId: string, name: string) => {
    setError(null);
    start(async () => {
      const r = await getAddonTicket(purchaseId);
      if (r.ok) setTicket({ text: r.ticket, name }); else setError(r.error);
    });
  };

  const pay = () => {
    if (!paying) return;
    const item = paying;
    setError(null);
    start(async () => {
      const r = await buyAddon(item.id);
      setPaying(null);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      showTicket(r.purchase.id, item.name);
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}

      {ticket && (
        <Card className="border-2 border-primary/40" data-testid="addon-ticket" data-ticket={ticket.text}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle className="text-base">{t("ticketFor", { name: ticket.name })}</CardTitle>
            <button type="button" onClick={() => setTicket(null)} aria-label={t("close")} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <QrCode text={ticket.text} label={t("ticketQr")} className="w-64 max-w-full rounded-md border border-border" />
            <p className="text-center text-sm text-muted-foreground">{t("ticketHelp")}</p>
            {debug && <code className="block max-w-full break-all rounded bg-muted p-2 text-[10px]" data-testid="ticket-text">{ticket.text}</code>}
          </CardContent>
        </Card>
      )}

      {!messAssigned ? (
        <p className="text-muted-foreground">{t("noMess")}</p>
      ) : addons.length === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label={t("available")}>
          {addons.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Soup className="size-5" aria-hidden /></span>
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-muted-foreground">{a.left > 0 ? t("left", { n: a.left }) : t("soldOut")}</p>
                </div>
              </div>
              <Button disabled={a.left <= 0 || pending} onClick={() => setPaying(a)} data-testid={`pay-${a.name}`}>{t("pay", { price: rupees(a.pricePaise) })}</Button>
            </li>
          ))}
        </ul>
      )}

      {paying && (
        <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl">
            <p className="flex items-center gap-2 rounded-md bg-warning/20 px-3 py-2 text-sm font-semibold"><ShieldAlert className="size-4" aria-hidden /> {t("testBanner")}</p>
            <h2 id="pay-title" className="flex items-center gap-2 text-lg font-semibold"><CreditCard className="size-5" aria-hidden /> {t("testPayment")}</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("item")}</dt><dd>{paying.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("amount")}</dt><dd className="font-semibold">{rupees(paying.pricePaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("method")}</dt><dd>{t("mockCard")}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">{t("testNote")}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPaying(null)} disabled={pending}>{t("cancel")}</Button>
              <Button className="flex-1" onClick={pay} disabled={pending} data-testid="confirm-test-payment">{pending ? t("processing") : t("pay", { price: rupees(paying.pricePaise) })}</Button>
            </div>
          </div>
        </div>
      )}

      <section aria-labelledby="hist-title">
        <h2 id="hist-title" className="flex items-center gap-2 text-lg font-semibold"><Receipt className="size-5 text-primary" aria-hidden /> {t("history")}</h2>
        {purchases.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("noHistory")}</p> : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm" data-testid="addon-history-row">
                <div>
                  <p className="font-medium">{p.name} · {rupees(p.amountPaise)}</p>
                  <p className="text-xs text-muted-foreground">{p.date} · {tm(p.slot as "lunch")} · {p.ref} · {t("testTag")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", p.status === "redeemed" ? "bg-success/15 text-success" : "bg-warning/25")}>
                    {t(`status.${p.status}`)}
                  </span>
                  {p.status === "paid" && <Button size="sm" variant="outline" disabled={pending} onClick={() => showTicket(p.id, p.name)}>{t("showQr")}</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
