"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { NOTIFICATIONS_EVENT, NOTIFICATIONS_LOCAL_EVENT, type NotificationRow } from "./categories";

/**
 * Header bell for every role: unread count + a toast for a new notification. One refresh path: ask the database; a Realtime broadcast on the
 * user's own topic `notif:<id>` just makes it sooner, and a 20 s poll is the fallback if the socket is down.
 */
export function NotificationBell({ userId }: { userId: string }) {
  const t = useTranslations("Notifications");
  const tc = useTranslations("Notifications.categories");
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<NotificationRow | null>(null);
  const lastId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const db = createClient();
    const [{ data: count }, { data: rows }] = await Promise.all([db.rpc("unread_notification_count"), db.rpc("my_notifications", { p_limit: 10 })]);
    if (typeof count === "number") setUnread(count);
    const list = (rows ?? []) as NotificationRow[];
    const max = list.reduce((m, r) => Math.max(m, r.id), 0);
    if (lastId.current === null) { lastId.current = max; return; } // first load: no toast for old items
    const fresh = list.filter((r) => r.id > (lastId.current ?? 0) && !r.read_at).sort((a, b) => b.id - a.id)[0];
    lastId.current = Math.max(lastId.current, max);
    if (fresh) {
      setToast(fresh);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 8000);
      window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    const on = () => void refresh();
    window.addEventListener(NOTIFICATIONS_LOCAL_EVENT, on); // the inbox changed something (read / mute)
    const db = createClient();
    const ch = db.channel(`notif:${userId}`, { config: { broadcast: { self: false } } }).on("broadcast", { event: "notif" }, () => void refresh()).subscribe();
    return () => { clearTimeout(first); clearInterval(poll); window.removeEventListener(NOTIFICATIONS_LOCAL_EVENT, on); void db.removeChannel(ch); };
  }, [userId, refresh]);

  return (
    <>
      <Link href="/dashboard/notifications" aria-label={t("bell", { n: unread })} data-testid="notif-bell"
        className="relative inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" data-testid="notif-count">{unread > 99 ? "99+" : unread}</span>
        )}
      </Link>
      {toast && (
        <div role="status" data-testid="notif-toast" className="fixed right-4 top-20 z-[70] flex max-w-xs items-start gap-3 rounded-lg border-2 border-primary bg-card p-4 shadow-xl">
          <Bell className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tc(toast.category)}</p>
            <p className="font-semibold">{toast.title}</p>
            {toast.body && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{toast.body}</p>}
            <Link href="/dashboard/notifications" className="mt-1 inline-block text-brand underline" onClick={() => setToast(null)}>{t("open")}</Link>
          </div>
          <button type="button" onClick={() => setToast(null)} aria-label={t("dismiss")} className="rounded p-0.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
      )}
    </>
  );
}
