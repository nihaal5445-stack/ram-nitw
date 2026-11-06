"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Send, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const OPEN_CONTACT_EVENT = "ram:open-contact";
interface Msg { id: number; sender: "student" | "admin"; body: string; created_at: string }
const hhmm = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Student: a direct message thread with the admin of their mess. Floating button on mobile; the navbar button (desktop) opens the same panel. */
export function ContactAdmin() {
  const t = useTranslations("Messages");
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async (isOpen: boolean) => {
    if (document.hidden) return;
    const db = createClient();
    if (isOpen) {
      const { data } = await db.from("admin_messages").select("id, sender, body, created_at").order("created_at");
      if (data) setMsgs(data as Msg[]);
      await db.rpc("student_thread_read");
      setUnread(0);
    } else {
      const { data } = await db.rpc("student_unread_count");
      if (typeof data === "number") setUnread(data);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(open), 0);
    const id = setInterval(() => void load(open), open ? 6000 : 30000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [open, load]);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_CONTACT_EVENT, on);
    return () => window.removeEventListener(OPEN_CONTACT_EVENT, on);
  }, []);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setErr(null);
    const { error } = await createClient().rpc("send_student_message", { p_body: text });
    if (error) { setErr(error.message.includes("rate_limited") ? t("rate") : t("failed")); return; }
    setText(""); await load(true);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("contact")} data-testid="contact-fab"
        className="fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg md:hidden">
        <MessageCircle className="size-5" aria-hidden />{t("contact")}
        {unread > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[11px] text-destructive-foreground">{unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="contact-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex h-[80vh] w-full max-w-md flex-col rounded-t-xl border border-border bg-card shadow-xl sm:h-[32rem] sm:rounded-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div><h2 id="contact-title" className="font-semibold">{t("title")}</h2><p className="text-xs text-muted-foreground">{t("lead")}</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4" data-testid="contact-thread" role="log" aria-live="polite">
              {msgs.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
              {msgs.map((m) => (
                <div key={m.id} className={cn("flex", m.sender === "student" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.sender === "student" ? "bg-primary text-primary-foreground" : "border border-border bg-muted/50")}>
                    <p className="whitespace-pre-line">{m.body}</p>
                    <p className="mt-1 text-[10px] opacity-70">{m.sender === "student" ? t("you") : t("admin")} · {hhmm(m.created_at)}</p>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form onSubmit={send} className="space-y-1 border-t border-border p-3">
              {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
              <div className="flex gap-2">
                <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t("placeholder")} aria-label={t("placeholder")} data-testid="contact-input" />
                <Button type="submit" disabled={!text.trim()} aria-label={t("send")} data-testid="contact-send"><Send className="size-4" aria-hidden /></Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** The always-visible desktop entry in the navbar. */
export function ContactAdminNavButton() {
  const t = useTranslations("Messages");
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONTACT_EVENT))} data-testid="contact-nav"
      className="hidden h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted md:inline-flex">
      <MessageCircle className="size-4" aria-hidden />{t("contact")}
    </button>
  );
}
