"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCheck, Pin } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_ICON, NOTIFICATIONS_EVENT, NOTIFICATIONS_LOCAL_EVENT, UNMUTABLE, type Category, type NotificationRow } from "./categories";

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Full inbox: filter by category, mark read, mark all read, and (students/parents) mute categories. */
export function Inbox({ showSettings }: { showSettings: boolean }) {
  const t = useTranslations("Notifications");
  const tc = useTranslations("Notifications.categories");
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [filter, setFilter] = useState<Category | "all" | "unread">("all");
  const [muted, setMuted] = useState<string[]>([]);

  const load = useCallback(async () => {
    const db = createClient();
    const { data } = await db.rpc("my_notifications", { p_limit: 200 });
    if (data) setRows(data as NotificationRow[]);
    if (showSettings) { const m = await db.rpc("my_muted_categories"); if (m.data) setMuted(m.data as string[]); }
  }, [showSettings]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const on = () => void load();
    window.addEventListener(NOTIFICATIONS_EVENT, on);
    const poll = setInterval(() => { if (!document.hidden) void load(); }, 20_000);
    return () => { clearTimeout(first); clearInterval(poll); window.removeEventListener(NOTIFICATIONS_EVENT, on); };
  }, [load]);

  const changed = async () => { window.dispatchEvent(new Event(NOTIFICATIONS_LOCAL_EVENT)); await load(); };
  const markRead = async (id: number) => { await createClient().rpc("mark_notification_read", { p_id: id }); await changed(); };
  const markAll = async () => { await createClient().rpc("mark_all_notifications_read", { p_category: CATEGORIES.includes(filter as Category) ? filter : null }); await changed(); };
  const toggleMute = async (c: Category) => { setMuted((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c])); await createClient().rpc("set_notification_mute", { p_category: c, p_muted: !muted.includes(c) }); await changed(); };

  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const r of rows ?? []) m[r.category] = (m[r.category] ?? 0) + 1; return m; }, [rows]);
  const unread = (rows ?? []).filter((r) => !r.read_at).length;
  const shown = (rows ?? []).filter((r) => filter === "all" || (filter === "unread" ? !r.read_at : r.category === filter));
  const chips: { key: Category | "all" | "unread"; label: string }[] = [
    { key: "all", label: `${t("all")} (${rows?.length ?? 0})` }, { key: "unread", label: `${t("unread")} (${unread})` },
    ...CATEGORIES.filter((c) => counts[c]).map((c) => ({ key: c, label: `${tc(c)} (${counts[c]})` })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("filter")} className="flex flex-wrap gap-1.5" data-testid="notif-filters">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => setFilter(c.key)} aria-pressed={filter === c.key} data-testid={`filter-${c.key}`}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", filter === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{c.label}</button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={markAll} disabled={unread === 0} data-testid="mark-all-read"><CheckCheck className="mr-1 size-4" aria-hidden />{t("markAll")}</Button>
      </div>

      {rows === null ? <div className="h-40 animate-pulse rounded-lg bg-muted" aria-hidden />
        : shown.length === 0 ? <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground" data-testid="notif-empty">{t("empty")}</p>
        : (
          <ul className="space-y-2" data-testid="notif-list">
            {shown.map((n) => {
              const Icon = CATEGORY_ICON[n.category] ?? CATEGORY_ICON.general;
              return (
                <li key={n.id} data-testid="notif-item" data-unread={n.read_at ? "false" : "true"} data-category={n.category}
                  className={cn("flex gap-3 rounded-lg border p-4", n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5")}>
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>{tc(n.category)}</span>
                      {n.pinned && <span className="inline-flex items-center gap-0.5 text-gold"><Pin className="size-3" aria-hidden />{t("pinned")}</span>}
                      <time dateTime={n.created_at} className="font-normal normal-case tracking-normal">{when(n.created_at)}</time>
                    </div>
                    <p className={cn("mt-0.5", !n.read_at && "font-semibold")}>{n.title}</p>
                    {n.body && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      {n.link && n.link !== "/dashboard/notifications" && <Link href={n.link} onClick={() => void markRead(n.id)} className="text-brand underline">{t("open")}</Link>}
                      {!n.read_at && <button type="button" onClick={() => void markRead(n.id)} className="text-muted-foreground underline" data-testid="mark-read">{t("markRead")}</button>}
                    </div>
                  </div>
                  {!n.read_at && <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t("unread")} />}
                </li>
              );
            })}
          </ul>
        )}

      {showSettings && (
        <section aria-labelledby="mute-title" className="rounded-lg border border-border bg-card p-4" data-testid="mute-settings">
          <h2 id="mute-title" className="font-semibold">{t("settingsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("settingsLead")}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => {
              const fixed = UNMUTABLE.includes(c);
              return (
                <li key={c}>
                  <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span>{tc(c)}{fixed && <span className="ml-2 text-xs text-muted-foreground">{t("alwaysOn")}</span>}</span>
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={fixed || !muted.includes(c)} disabled={fixed}
                      onChange={() => void toggleMute(c)} aria-label={t("receive", { category: tc(c) })} data-testid={`mute-${c}`} />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
