"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAddon } from "@/app/actions/addons";

export interface AdminAddonRow { id: string; name: string; price: number; stock: number; sold: number; served: number; active: boolean }

export function AddonAdmin({ rows }: { rows: AdminAddonRow[] }) {
  const t = useTranslations("Addons.admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", price: "50", stock: "40" });

  // live stock: refresh the server data every 5 s
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) router.refresh(); }, 5000);
    return () => clearInterval(id);
  }, [router]);

  const save = (input: { id?: string; name: string; price: number; stock: number; active: boolean }, after?: () => void) =>
    start(async () => {
      const r = await saveAddon({ id: input.id, name: input.name, priceRupees: input.price, stock: input.stock, active: input.active });
      setMsg(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error });
      if (r.ok) { after?.(); router.refresh(); }
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success" : "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"}>{msg.text}</p>}

      <form
        className="grid items-end gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={(e) => { e.preventDefault(); save({ name: form.name, price: Number(form.price), stock: Number(form.stock), active: true }, () => setForm({ name: "", price: "50", stock: "40" })); }}
      >
        <div><Label htmlFor="ad-name">{t("name")}</Label><Input id="ad-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chicken Curry" /></div>
        <div><Label htmlFor="ad-price">{t("price")}</Label><Input id="ad-price" type="number" min={0} step="1" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><Label htmlFor="ad-stock">{t("stock")}</Label><Input id="ad-stock" type="number" min={0} step="1" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
        <Button type="submit" disabled={pending}>{t("add")}</Button>
      </form>

      {rows.length === 0 ? <p className="text-muted-foreground">{t("none")}</p> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="addon-table">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">{t("name")}</th><th className="p-3">{t("price")}</th><th className="p-3">{t("left")}</th><th className="p-3">{t("sold")}</th><th className="p-3">{t("served")}</th><th className="p-3">{t("active")}</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 tabular-nums">Rs {r.price}</td>
                  <td className="p-3 tabular-nums font-semibold" data-testid={`left-${r.name}`}>{r.stock - r.sold} / {r.stock}</td>
                  <td className="p-3 tabular-nums">{r.sold}</td>
                  <td className="p-3 tabular-nums">{r.served}</td>
                  <td className="p-3">
                    <input type="checkbox" checked={r.active} disabled={pending} aria-label={`${t("active")}: ${r.name}`}
                      onChange={(e) => save({ id: r.id, name: r.name, price: r.price, stock: r.stock, active: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("pureVeg")}</p>
    </div>
  );
}
