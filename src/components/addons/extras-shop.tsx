"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Minus, Plus, QrCode as QrIcon, Receipt as ReceiptIcon, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/access/qr-code";
import { checkoutCart, getAddonTickets } from "@/app/actions/addons";
import { confirmRazorpayCart, startRazorpayCart } from "@/app/actions/payments";
import { MAX_ITEMS, MAX_PER_ITEM, type CartLine, type CartResult } from "@/lib/addons/cart";
import { PaymentSheet, Receipt, rupees, type PayApi } from "./payment-sheet";
import { cn } from "@/lib/utils";

export interface ShopItem { id: string; name: string; pricePaise: number; left: number; veg: boolean; photo: string }
export interface OrderTicket { id: string; name: string; status: "paid" | "redeemed" }
export interface ShopOrder { id: string; at: string; amountPaise: number; method: string; ref: string; orderId: string; tickets: OrderTicket[] }

function VegMark({ veg }: { veg: boolean }) {
  const t = useTranslations("Extras");
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" title={veg ? t("veg") : t("nonVeg")}>
      <span className={cn("inline-flex size-4 items-center justify-center rounded-[3px] border-2", veg ? "border-success" : "border-destructive")} aria-hidden><span className={cn("size-2 rounded-full", veg ? "bg-success" : "bg-destructive")} /></span>
      {veg ? t("veg") : t("nonVeg")}
    </span>
  );
}

export function ExtrasShop({ items, orders, messAssigned, razorpay, debug }: { items: ShopItem[]; orders: ShopOrder[]; messAssigned: boolean; razorpay: boolean; debug?: boolean }) {
  const t = useTranslations("Extras");
  const tp = useTranslations("Addons.pay");
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});       // quantity picker on each card
  const [cart, setCart] = useState<Record<string, number>>({});     // addon id -> qty
  const [drawer, setDrawer] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<CartResult | null>(null);
  const [tickets, setTickets] = useState<{ id: string; label: string; text: string }[] | null>(null);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // the cart survives a reload (per tab)
  useEffect(() => { const id = setTimeout(() => { try { const s = sessionStorage.getItem("ram-cart"); if (s) setCart(JSON.parse(s)); } catch { /* ignore */ } }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { try { sessionStorage.setItem("ram-cart", JSON.stringify(cart)); } catch { /* ignore */ } }, [cart]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lines: CartLine[] = Object.entries(cart).filter(([id, q]) => q > 0 && byId.has(id)).map(([addonId, q]) => ({ addonId, qty: q }));
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.qty * (byId.get(l.addonId)?.pricePaise ?? 0), 0);
  const cap = (i: ShopItem) => Math.min(MAX_PER_ITEM, i.left);

  const addToCart = (i: ShopItem) => {
    const want = qty[i.id] ?? 1;
    setError(null);
    setCart((c) => {
      const others = Object.entries(c).filter(([id]) => id !== i.id).reduce((a, [, q]) => a + q, 0);
      const next = Math.min(cap(i), (c[i.id] ?? 0) + want, MAX_ITEMS - others);
      return { ...c, [i.id]: next };
    });
    setQty((q) => ({ ...q, [i.id]: 1 }));
    setDrawer(true);
  };
  const setLine = (id: string, q: number) => setCart((c) => { const it = byId.get(id); const n = Math.max(0, Math.min(q, it ? cap(it) : 0)); const { [id]: _drop, ...rest } = c; void _drop; return n > 0 ? { ...c, [id]: n } : rest; });

  const api: PayApi<CartResult> = {
    title: t("orderTitle", { n: count }), amountPaise: total, razorpay,
    mock: async (m) => checkoutCart(lines, m),
    razorpayStart: () => startRazorpayCart(lines),
    razorpayConfirm: (r) => confirmRazorpayCart(r),
  };

  const loadTickets = (ids: { id: string; label: string }[]) => start(async () => {
    const r = await getAddonTickets(ids.map((x) => x.id));
    if (!r.ok) { setError(r.error); return; }
    setTickets(ids.filter((x) => r.tickets[x.id]).map((x) => ({ ...x, text: r.tickets[x.id] })));
  });
  const closePay = () => {
    setPaying(false);
    if (paid) {
      setCart({}); setDrawer(false);
      loadTickets(paid.tickets.map((x) => ({ id: x.id, label: `${x.name} (${x.n} of ${x.of})` })));
      setPaid(null); router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setDrawer(true)} variant="outline" data-testid="open-cart" className="relative">
          <ShoppingCart className="size-4" aria-hidden />{t("cart")}{count > 0 && <span className="ml-1 rounded-full bg-primary px-2 text-xs text-primary-foreground" data-testid="cart-count">{count}</span>}
        </Button>
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}

      {tickets && (
        <section className="space-y-3 rounded-lg border-2 border-primary/40 bg-card p-4" data-testid="ticket-list" aria-label={t("yourTickets")}>
          <div className="flex items-start justify-between"><h2 className="font-semibold">{t("yourTickets", { n: tickets.length })}</h2>
            <button type="button" onClick={() => setTickets(null)} aria-label={t("close")} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button></div>
          <p className="text-sm text-muted-foreground">{t("ticketsHelp")}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tickets.map((k) => (
              <li key={k.id} className="flex flex-col items-center gap-2 rounded-md border border-border p-3" data-testid="ticket" data-ticket={k.text}>
                <p className="text-sm font-medium">{k.label}</p>
                <QrCode text={k.text} label={k.label} className="w-48 max-w-full rounded border border-border" />
                {debug && <code className="block max-w-full break-all rounded bg-muted p-1 text-[9px]">{k.text}</code>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!messAssigned ? <p className="text-muted-foreground">{t("noMess")}</p> : items.length === 0 ? <p className="text-muted-foreground">{t("none")}</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("available")}>
          {items.map((i) => {
            const q = qty[i.id] ?? 1;
            const inCart = cart[i.id] ?? 0;
            return (
              <li key={i.id} className="overflow-hidden rounded-lg border border-border bg-card" data-testid="extra-card" data-name={i.name}>
                <div className="relative aspect-[16/10] bg-muted">
                  <Image src={`/images/${i.photo}.jpg`} alt={t("photoAlt", { name: i.name })} fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 100vw" className="object-cover" />
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5"><VegMark veg={i.veg} /></span>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold leading-snug">{i.name}</h2>
                    <p className="shrink-0 font-semibold text-brand">{rupees(i.pricePaise)}</p>
                  </div>
                  <p className={cn("text-sm", i.left === 0 ? "font-medium text-destructive" : i.left <= 5 ? "font-medium text-warning" : "text-muted-foreground")} data-testid="stock-left">{i.left > 0 ? t("left", { n: i.left }) : t("soldOut")}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-md border border-border" role="group" aria-label={t("quantity", { name: i.name })}>
                      <button type="button" className="p-2 hover:bg-muted disabled:opacity-40" onClick={() => setQty({ ...qty, [i.id]: Math.max(1, q - 1) })} disabled={i.left === 0 || q <= 1} aria-label={t("less")} data-testid="qty-minus"><Minus className="size-4" /></button>
                      <span className="w-8 text-center text-sm tabular-nums" data-testid="qty-value" aria-live="polite">{q}</span>
                      <button type="button" className="p-2 hover:bg-muted disabled:opacity-40" onClick={() => setQty({ ...qty, [i.id]: Math.min(cap(i), q + 1) })} disabled={i.left === 0 || q >= cap(i)} aria-label={t("more")} data-testid="qty-plus"><Plus className="size-4" /></button>
                    </div>
                    <Button size="sm" disabled={i.left === 0 || inCart >= cap(i)} onClick={() => addToCart(i)} data-testid="add-to-cart">{t("addToCart")}</Button>
                  </div>
                  {inCart > 0 && <p className="text-xs text-muted-foreground">{t("inCart", { n: inCart })}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("photoNote")}</p>

      {/* cart drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-labelledby="cart-title" data-testid="cart-drawer">
          <div className="flex h-full w-full max-w-md flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 id="cart-title" className="flex items-center gap-2 font-semibold"><ShoppingCart className="size-5" aria-hidden />{t("cart")}</h2>
              <button type="button" onClick={() => setDrawer(false)} aria-label={t("close")} className="rounded p-1 hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {lines.length === 0 ? <p className="text-sm text-muted-foreground">{t("emptyCart")}</p> : (
                <ul className="divide-y divide-border">
                  {lines.map((l) => { const it = byId.get(l.addonId)!; return (
                    <li key={l.addonId} className="flex items-center gap-3 py-3" data-testid="cart-line">
                      <div className="min-w-0 flex-1"><p className="truncate font-medium">{it.name}</p><p className="text-sm text-muted-foreground">{rupees(it.pricePaise)} × {l.qty}</p></div>
                      <div className="inline-flex items-center rounded-md border border-border">
                        <button type="button" className="p-1.5 hover:bg-muted" onClick={() => setLine(l.addonId, l.qty - 1)} aria-label={t("less")}><Minus className="size-4" /></button>
                        <span className="w-7 text-center text-sm tabular-nums">{l.qty}</span>
                        <button type="button" className="p-1.5 hover:bg-muted disabled:opacity-40" disabled={l.qty >= cap(it) || count >= MAX_ITEMS} onClick={() => setLine(l.addonId, l.qty + 1)} aria-label={t("more")}><Plus className="size-4" /></button>
                      </div>
                      <p className="w-16 text-right font-medium tabular-nums">{rupees(it.pricePaise * l.qty)}</p>
                      <button type="button" onClick={() => setLine(l.addonId, 0)} aria-label={t("remove", { name: it.name })} className="rounded p-1 hover:bg-muted"><Trash2 className="size-4" /></button>
                    </li>); })}
                </ul>
              )}
            </div>
            <div className="space-y-3 border-t border-border p-4">
              <p className="flex justify-between text-lg font-semibold"><span>{t("total")}</span><span data-testid="cart-total">{rupees(total)}</span></p>
              <p className="text-xs text-muted-foreground">{t("ticketPerItem")}</p>
              <Button className="w-full" disabled={lines.length === 0 || pending} onClick={() => { setDrawer(false); setPaying(true); }} data-testid="checkout">{t("checkout", { price: rupees(total) })}</Button>
            </div>
          </div>
        </div>
      )}

      {paying && <PaymentSheet api={api} onClose={closePay} onPaid={setPaid} />}

      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="flex items-center gap-2 text-lg font-semibold"><ReceiptIcon className="size-5 text-primary" aria-hidden />{t("orders")}</h2>
        {orders.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("noOrders")}</p> : (
          <ul className="mt-3 space-y-3">
            {orders.map((o) => {
              const open = o.tickets.filter((k) => k.status === "paid");
              return (
                <li key={o.id} className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm" data-testid="order-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-medium">{rupees(o.amountPaise)} · {t("ticketsCount", { n: o.tickets.length })}</p><p className="text-xs text-muted-foreground">{o.orderId}</p></div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("usedOf", { used: o.tickets.length - open.length, total: o.tickets.length })}</span>
                      <Button size="sm" variant="ghost" onClick={() => setOpenReceipt(openReceipt === o.id ? null : o.id)} data-testid="receipt-toggle">{openReceipt === o.id ? tp("hideReceipt") : tp("receipt")}</Button>
                      {open.length > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => loadTickets(open.map((k) => ({ id: k.id, label: k.name })))}><QrIcon className="size-4" aria-hidden />{t("showQrs")}</Button>}
                    </div>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">{o.tickets.map((k) => <li key={k.id} className={cn("rounded-full px-2 py-0.5 text-xs", k.status === "redeemed" ? "bg-success/15 text-success" : "bg-warning/25")}>{k.name}: {k.status === "redeemed" ? t("used") : t("ready")}</li>)}</ul>
                  {openReceipt === o.id && <Receipt r={{ orderId: o.orderId, paymentRef: o.ref, amountPaise: o.amountPaise, method: o.method, at: o.at, name: t("ticketsCount", { n: o.tickets.length }) }} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
