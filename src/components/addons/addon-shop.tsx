"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt as ReceiptIcon, Soup, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode } from "@/components/access/qr-code";
import { getAddonTicket, type Purchase } from "@/app/actions/addons";
import { PaymentSheet, Receipt, rupees, type PayItem } from "./payment-sheet";
import { cn } from "@/lib/utils";

export interface ShopAddon { id: string; name: string; pricePaise: number; left: number }
export interface ShopPurchase { id: string; name: string; date: string; slot: string; amountPaise: number; ref: string; orderId: string | null; method: string; status: "paid" | "redeemed"; at: string }

export function AddonShop({ addons, purchases, messAssigned, debug, razorpay }: { addons: ShopAddon[]; purchases: ShopPurchase[]; messAssigned: boolean; debug?: boolean; razorpay: boolean }) {
  const t = useTranslations("Addons");
  const tp = useTranslations("Addons.pay");
  const tm = useTranslations("Public.meals");
  const router = useRouter();
  const [paying, setPaying] = useState<PayItem | null>(null);
  const [justPaid, setJustPaid] = useState<Purchase | null>(null);
  const [ticket, setTicket] = useState<{ text: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const showTicket = (purchaseId: string, name: string) => {
    setError(null);
    start(async () => {
      const r = await getAddonTicket(purchaseId);
      if (r.ok) setTicket({ text: r.ticket, name }); else setError(r.error);
    });
  };
  const closeSheet = () => {
    setPaying(null);
    if (justPaid) { router.refresh(); showTicket(justPaid.id, justPaid.name); setJustPaid(null); }
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
              <Button disabled={a.left <= 0 || pending} onClick={() => setPaying({ id: a.id, name: a.name, pricePaise: a.pricePaise })} data-testid={`pay-${a.name}`}>{t("pay", { price: rupees(a.pricePaise) })}</Button>
            </li>
          ))}
        </ul>
      )}

      {paying && <PaymentSheet item={paying} razorpay={razorpay} onClose={closeSheet} onPaid={setJustPaid} />}

      <section aria-labelledby="hist-title">
        <h2 id="hist-title" className="flex items-center gap-2 text-lg font-semibold"><ReceiptIcon className="size-5 text-primary" aria-hidden /> {t("history")}</h2>
        {purchases.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("noHistory")}</p> : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {purchases.map((p) => (
              <li key={p.id} className="space-y-2 p-3 text-sm" data-testid="addon-history-row">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{p.name} · {rupees(p.amountPaise)}</p>
                    <p className="text-xs text-muted-foreground">{p.date} · {tm(p.slot as "lunch")} · {p.ref}{p.method === "razorpay" ? "" : ` · ${t("testTag")}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", p.status === "redeemed" ? "bg-success/15 text-success" : "bg-warning/25")}>{t(`status.${p.status}`)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setOpenReceipt(openReceipt === p.id ? null : p.id)} aria-expanded={openReceipt === p.id} data-testid="receipt-toggle">{openReceipt === p.id ? tp("hideReceipt") : tp("receipt")}</Button>
                    {p.status === "paid" && <Button size="sm" variant="outline" disabled={pending} onClick={() => showTicket(p.id, p.name)}>{t("showQr")}</Button>}
                  </div>
                </div>
                {openReceipt === p.id && <Receipt r={{ orderId: p.orderId ?? "-", paymentRef: p.ref, amountPaise: p.amountPaise, method: p.method, at: p.at, name: p.name }} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
