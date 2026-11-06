"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, MessageSquareWarning, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export const COMPLAINTS_EVENT = "ram:complaints-changed";

/** Mess admin header: unread badge for unseen complaints + a "New complaint" toast, live via the Realtime `complaints` channel. */
export function AdminNotifier({ messId }: { messId: string }) {
  const t = useTranslations("Complaints.live");
  const path = usePathname();
  const [unseen, setUnseen] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const onConsole = path.startsWith("/dashboard/admin/complaints");

  const refresh = useCallback(async () => {
    const db = createClient();
    if (onConsole) { await db.rpc("mark_complaints_seen"); setUnseen(0); return; }
    const { data } = await db.rpc("admin_unseen_complaints");
    if (typeof data === "number") setUnseen(data);
  }, [onConsole]);

  useEffect(() => { const id = setTimeout(() => void refresh(), 0); return () => clearTimeout(id); }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 30_000); // fallback if the socket drops
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    let stop = false; let cleanup: (() => void) | undefined;
    (async () => {
      const db = createClient();
      if (stop) return;
      const ch = db.channel("complaints", { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "complaint" }, ({ payload }) => {
          if ((payload as { mess_id?: string }).mess_id !== messId) return; // only my mess
          window.dispatchEvent(new Event(COMPLAINTS_EVENT));
          setToast(t("toast")); setTimeout(() => setToast(null), 7000);
          void refresh();
        }).subscribe();
      cleanup = () => { void db.removeChannel(ch); };
    })();
    return () => { stop = true; cleanup?.(); };
  }, [messId, refresh, t]);

  return (
    <>
      <Link href="/dashboard/admin/complaints" data-testid="complaints-nav" aria-label={t("nav", { n: unseen })}
        className="relative hidden h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium hover:bg-muted sm:inline-flex">
        <MessageSquareWarning className="size-3.5" aria-hidden />{t("navLabel")}
        {unseen > 0 && <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground" data-testid="complaints-unseen">{unseen}</span>}
      </Link>
      {toast && (
        <div role="status" data-testid="complaint-toast" className="fixed right-4 top-20 z-[70] flex max-w-xs items-start gap-3 rounded-lg border-2 border-primary bg-card p-4 shadow-xl">
          <Bell className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="text-sm"><p className="font-semibold">{toast}</p>
            <Link href="/dashboard/admin/complaints" className="text-brand underline">{t("open")}</Link></div>
          <button type="button" onClick={() => setToast(null)} aria-label={t("dismiss")} className="rounded p-0.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
      )}
    </>
  );
}
