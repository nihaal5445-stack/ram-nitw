"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAddon } from "@/app/actions/addons";
import { EXTRA_PHOTOS } from "@/lib/addons/cart";

export interface AdminAddonRow { id: string; name: string; price: number; stock: number; sold: number; served: number; active: boolean; veg: boolean; photo: string }
export interface AdminOrderRow { id: string; at: string; student: string; roll: string | null; amountPaise: number; items: { name: string; qty: number }[]; tickets: number; used: number }
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const stamp = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

interface Form { id?: string; name: string; price: string; stock: string; veg: boolean; photo: string; active: boolean }
const blank: Form = { name: "", price: "50", stock: "40", veg: true, photo: "grab-go", active: true };

export function AddonAdmin({ rows, orders }: { rows: AdminAddonRow[]; orders: AdminOrderRow[] }) {
  const t = useTranslations("Extras.admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<Form>(blank);

  // live: refresh the server data every 5 s (stock, sold, orders)
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) router.refresh(); }, 5000);
    return () => clearInterval(id);
  }, [router]);

  const save = (f: Form, after?: () => void) => start(async () => {
    const r = await saveAddon({ id: f.id, name: f.name, priceRupees: Number(f.price), stock: Number(f.stock), active: f.active, veg: f.veg, photo: f.photo });
    setMsg(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error });
    if (r.ok) { after?.(); router.refresh(); }
  });
  const toForm = (r: AdminAddonRow): Form => ({ id: r.id, name: r.name, price: String(r.price), stock: String(r.stock), veg: r.veg, photo: r.photo, active: r.active });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success" : "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"}>{msg.text}</p>}

      <form className="grid items-end gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.2fr_auto_auto]" data-testid="item-form"
        onSubmit={(e) => { e.preventDefault(); save(form, () => setForm(blank)); }}>
        <div><Label htmlFor="ad-name">{t("name")}</Label><Input id="ad-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chicken Curry" /></div>
        <div><Label htmlFor="ad-price">{t("price")}</Label><Input id="ad-price" type="number" min={0} step="1" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><Label htmlFor="ad-stock">{t("stock")}</Label><Input id="ad-stock" type="number" min={0} step="1" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
        <div><Label htmlFor="ad-photo">{t("photo")}</Label><select id="ad-photo" className={selectCls} value={form.photo} onChange={(e) => setForm({ ...form, photo: e.target.value })}>{EXTRA_PHOTOS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={form.veg} onChange={(e) => setForm({ ...form, veg: e.target.checked })} data-testid="item-veg" />{t("veg")}</label>
        <div className="flex gap-2"><Button type="submit" disabled={pending} data-testid="item-save">{form.id ? t("save") : t("add")}</Button>{form.id && <Button type="button" variant="outline" onClick={() => setForm(blank)}>{t("cancel")}</Button>}</div>
      </form>

      {rows.length === 0 ? <p className="text-muted-foreground">{t("none")}</p> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="addon-table">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">{t("name")}</th><th className="p-3">{t("price")}</th><th className="p-3">{t("left")}</th><th className="p-3">{t("sold")}</th><th className="p-3">{t("served")}</th><th className="p-3">{t("onSale")}</th><th className="p-3">&nbsp;</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-medium">{r.name} <span className="text-xs font-normal text-muted-foreground">{r.veg ? "Veg" : "Non-veg"}</span></td>
                  <td className="p-3 tabular-nums">Rs {r.price}</td>
                  <td className="p-3 tabular-nums font-semibold" data-testid={`left-${r.name}`}>{r.stock - r.sold} / {r.stock}</td>
                  <td className="p-3 tabular-nums">{r.sold}</td>
                  <td className="p-3 tabular-nums">{r.served}</td>
                  <td className="p-3"><input type="checkbox" checked={r.active} disabled={pending} aria-label={`${t("onSale")}: ${r.name}`} onChange={(e) => save({ ...toForm(r), active: e.target.checked })} /></td>
                  <td className="p-3"><div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => save({ ...toForm(r), stock: String(r.stock + 10) })} data-testid={`restock-${r.name}`}>{t("restock")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm(toForm(r))} data-testid={`edit-${r.name}`}>{t("edit")}</Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("pureVeg")}</p>

      <section aria-labelledby="orders-h" className="space-y-2">
        <h2 id="orders-h" className="text-lg font-semibold">{t("orders")}</h2>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">{t("noOrders")}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="orders-table">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">{t("time")}</th><th className="p-3">{t("student")}</th><th className="p-3">{t("items")}</th><th className="p-3">{t("total")}</th><th className="p-3">{t("tickets")}</th></tr></thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.id} data-testid="order-line">
                    <td className="p-3 whitespace-nowrap">{stamp(o.at)}</td>
                    <td className="p-3">{o.student}{o.roll ? ` · ${o.roll}` : ""}</td>
                    <td className="p-3">{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</td>
                    <td className="p-3 tabular-nums">Rs {o.amountPaise / 100}</td>
                    <td className="p-3 tabular-nums">{o.used} / {o.tickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
