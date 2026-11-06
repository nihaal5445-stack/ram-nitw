"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, CreditCard, Landmark, Loader2, ShieldAlert, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode } from "@/components/access/qr-code";
import { cn } from "@/lib/utils";

export interface PayReceipt { order_id: string; payment_ref: string; amount_paise: number; method: string; created_at: string; name: string }
type Res<R> = { ok: true; result: R } | { ok: false; error: string };
/** What the sheet pays for. The sheet knows nothing about carts or add-ons: callers plug in the server actions. */
export interface PayApi<R extends PayReceipt> {
  title: string; amountPaise: number; razorpay: boolean;
  mock: (method: "upi" | "card" | "wallet") => Promise<Res<R>>;
  razorpayStart: () => Promise<{ ok: true; orderId: string; keyId: string; amountPaise: number; name: string } | { ok: false; error: string }>;
  razorpayConfirm: (resp: { orderId: string; paymentId: string; signature: string }) => Promise<Res<R>>;
}
export const rupees = (p: number) => `Rs ${(p / 100).toFixed(p % 100 ? 2 : 0)}`;
const stamp = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function Receipt({ r, className }: { r: { orderId: string; paymentRef: string; amountPaise: number; method: string; at: string; name: string }; className?: string }) {
  const t = useTranslations("Addons.pay");
  return (
    <dl className={cn("space-y-1 rounded-md border border-dashed border-border p-3 text-sm", className)} data-testid="receipt">
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("item")}</dt><dd>{r.name}</dd></div>
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("amount")}</dt><dd className="font-semibold">{rupees(r.amountPaise)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("orderId")}</dt><dd className="font-mono text-xs" data-testid="receipt-order">{r.orderId}</dd></div>
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("paymentId")}</dt><dd className="font-mono text-xs">{r.paymentRef}</dd></div>
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("method")}</dt><dd>{t(`methods.${r.method}` as "methods.test")}</dd></div>
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("time")}</dt><dd>{stamp(r.at)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted-foreground">{t("status")}</dt><dd className="font-semibold text-success">{t("paid")}</dd></div>
      <p className="pt-1 text-xs text-muted-foreground">{t("noMoney")}</p>
    </dl>
  );
}

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, cb: () => void): void } } }
const loadCheckout = () => new Promise<boolean>((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => resolve(true); s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

type Tab = "upi" | "card" | "wallet";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Payment sheet. Razorpay Checkout (test mode) when the server has keys, otherwise a realistic TEST payment sheet. Nothing is ever charged. */
export function PaymentSheet<R extends PayReceipt>({ api, onClose, onPaid }: { api: PayApi<R>; onClose: () => void; onPaid: (r: R) => void }) {
  const razorpay = api.razorpay;
  const item = { name: api.title, pricePaise: api.amountPaise };
  const t = useTranslations("Addons.pay");
  const [tab, setTab] = useState<Tab>("upi");
  const [phase, setPhase] = useState<"choose" | "processing" | "success">("choose");
  const [receipt, setReceipt] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState({ number: "4242 4242 4242 4242", expiry: "12/30", cvv: "123", name: "Demo Student" });
  const [wallet, setWallet] = useState("phonepe");

  const finish = (p: R) => { setReceipt(p); setPhase("success"); onPaid(p); };

  const payMock = async (method: Tab) => {
    setError(null); setPhase("processing");
    const [r] = await Promise.all([api.mock(method), wait(2000)]); // the 2-second "processing" state
    if (!r.ok) { setError(r.error); setPhase("choose"); return; }
    finish(r.result);
  };

  const payRazorpay = async () => {
    setError(null); setPhase("processing");
    const o = await api.razorpayStart();
    if (!o.ok) { setError(o.error); setPhase("choose"); return; }
    if (!(await loadCheckout()) || !window.Razorpay) { setError(t("scriptFail")); setPhase("choose"); return; }
    new window.Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amountPaise, currency: "INR", name: "RAM, NIT Warangal", description: o.name, theme: { color: "#7B1E1E" },
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        const c = await api.razorpayConfirm({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
        if (!c.ok) { setError(c.error); setPhase("choose"); return; }
        finish(c.result);
      },
      modal: { ondismiss: () => setPhase((p) => (p === "processing" ? "choose" : p)) },
    }).open();
  };

  const upiLink = `upi://pay?pa=ram.demo@testbank&pn=RAM%20NIT%20Warangal&am=${(item.pricePaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(item.name)}`;
  const tabs: { id: Tab; icon: typeof Smartphone }[] = [{ id: "upi", icon: Smartphone }, { id: "card", icon: CreditCard }, { id: "wallet", icon: Wallet }];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" data-testid="payment-sheet">
      <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-xl border border-border bg-card p-5 shadow-xl sm:rounded-xl">
        <p className="flex items-center gap-2 rounded-md bg-warning/20 px-3 py-2 text-sm font-semibold"><ShieldAlert className="size-4 shrink-0" aria-hidden />{razorpay ? t("bannerRazorpay") : t("banner")}</p>
        <div className="flex items-baseline justify-between">
          <h2 id="pay-title" className="flex items-center gap-2 text-lg font-semibold"><Landmark className="size-5" aria-hidden />{t("title")}</h2>
          <span className="text-right"><span className="block text-xs text-muted-foreground">{item.name}</span><span className="text-xl font-semibold">{rupees(item.pricePaise)}</span></span>
        </div>

        {phase === "processing" && (
          <div className="flex flex-col items-center gap-3 py-10" role="status" data-testid="processing">
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
            <p className="font-medium">{t("processing")}</p><p className="text-xs text-muted-foreground">{t("doNotClose")}</p>
          </div>
        )}

        {phase === "success" && receipt && (
          <div className="space-y-3" data-testid="pay-success">
            <p className="flex items-center gap-2 text-lg font-semibold text-success"><CheckCircle2 className="size-6" aria-hidden />{t("success")}</p>
            <Receipt r={{ orderId: receipt.order_id, paymentRef: receipt.payment_ref, amountPaise: receipt.amount_paise, method: receipt.method, at: receipt.created_at, name: receipt.name }} />
            <Button className="w-full" onClick={onClose} data-testid="pay-done">{t("showTicket")}</Button>
          </div>
        )}

        {phase === "choose" && razorpay && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("razorpayLead")}</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
              <Button className="flex-1" onClick={payRazorpay} data-testid="razorpay-pay">{t("payRazorpay", { price: rupees(item.pricePaise) })}</Button></div>
          </div>
        )}

        {phase === "choose" && !razorpay && (
          <div className="space-y-3">
            <div role="tablist" aria-label={t("methodsLabel")} className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
              {tabs.map(({ id, icon: Icon }) => (
                <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`tab-${id}`}
                  className={cn("flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-sm", tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  <Icon className="size-4" aria-hidden />{t(`tabs.${id}`)}
                </button>
              ))}
            </div>

            {tab === "upi" && (
              <div role="tabpanel" className="flex flex-col items-center gap-3">
                <QrCode text={upiLink} label={t("upiQr")} className="w-44 rounded border border-border" />
                <p className="text-center text-xs text-muted-foreground">{t("upiHelp")}</p>
                <p className="font-mono text-xs">ram.demo@testbank</p>
                <Button className="w-full" onClick={() => payMock("upi")} data-testid="upi-paid">{t("iHavePaid")}</Button>
              </div>
            )}
            {tab === "card" && (
              <form role="tabpanel" className="space-y-3" onSubmit={(e) => { e.preventDefault(); void payMock("card"); }}>
                <div><Label htmlFor="cn">{t("cardNumber")}</Label><Input id="cn" inputMode="numeric" autoComplete="off" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="ce">{t("expiry")}</Label><Input id="ce" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /></div>
                  <div><Label htmlFor="cc">{t("cvv")}</Label><Input id="cc" inputMode="numeric" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} /></div>
                </div>
                <div><Label htmlFor="cname">{t("nameOnCard")}</Label><Input id="cname" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground">{t("testCard")}</p>
                <Button type="submit" className="w-full" data-testid="card-pay">{t("payCard", { price: rupees(item.pricePaise) })}</Button>
              </form>
            )}
            {tab === "wallet" && (
              <div role="tabpanel" className="space-y-3">
                <fieldset className="space-y-2"><legend className="sr-only">{t("tabs.wallet")}</legend>
                  {(["phonepe", "paytm", "amazonpay"] as const).map((w) => (
                    <label key={w} className="flex items-center gap-2 rounded-md border border-border p-3 text-sm"><input type="radio" name="wallet" checked={wallet === w} onChange={() => setWallet(w)} />{t(`wallets.${w}`)}</label>
                  ))}
                </fieldset>
                <Button className="w-full" onClick={() => payMock("wallet")} data-testid="wallet-pay">{t("payWallet", { price: rupees(item.pricePaise) })}</Button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button variant="outline" className="w-full" onClick={onClose}>{t("cancel")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
