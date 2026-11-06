"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Thread { student_id: string; student_name: string | null; roll: string | null; last_body: string; last_sender: string; last_at: string; unread: number }
interface Msg { id: number; sender: "student" | "admin"; body: string; created_at: string }
const stamp = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function AdminInbox() {
  const t = useTranslations("Messages");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");

  const refresh = useCallback(async () => {
    if (document.hidden) return;
    const db = createClient();
    const { data } = await db.rpc("admin_inbox");
    if (data) setThreads(data as Thread[]);
    if (sel) { const r = await db.rpc("admin_thread", { p_student: sel }); if (r.data) setMsgs(r.data as Msg[]); }
  }, [sel]);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 6000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel || !text.trim()) return;
    await createClient().rpc("admin_reply_message", { p_student: sel, p_body: text });
    setText(""); await refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("inboxTitle")}</h1>
        <p className="mt-1 text-muted-foreground">{t("inboxLead")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <ul className="space-y-2" aria-label={t("inboxTitle")} data-testid="threads">
          {threads.length === 0 && <li className="text-sm text-muted-foreground">{t("noThreads")}</li>}
          {threads.map((th) => (
            <li key={th.student_id}>
              <button type="button" onClick={() => setSel(th.student_id)} data-testid="thread"
                className={cn("w-full rounded-md border p-3 text-left text-sm", sel === th.student_id ? "border-primary bg-primary/5" : "border-border bg-card")}>
                <span className="flex items-center justify-between gap-2"><span className="font-medium">{th.student_name ?? "Student"}{th.roll ? ` · ${th.roll}` : ""}</span>
                  {th.unread > 0 && <span className="rounded-full bg-destructive px-2 text-xs text-destructive-foreground" data-testid="unread">{t("unread", { n: th.unread })}</span>}</span>
                <span className="mt-0.5 block truncate text-muted-foreground">{th.last_sender === "admin" ? `${t("you")}: ` : ""}{th.last_body}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex min-h-[20rem] flex-col rounded-lg border border-border bg-card">
          {!sel ? <p className="p-4 text-sm text-muted-foreground">{t("pick")}</p> : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-4" data-testid="admin-thread" role="log">
                {msgs.map((m) => (
                  <div key={m.id} className={cn("flex", m.sender === "admin" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.sender === "admin" ? "bg-primary text-primary-foreground" : "border border-border bg-muted/50")}>
                      <p className="whitespace-pre-line">{m.body}</p><p className="mt-1 text-[10px] opacity-70">{stamp(m.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
                <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t("reply")} aria-label={t("reply")} data-testid="admin-reply-input" />
                <Button type="submit" disabled={!text.trim()} aria-label={t("send")} data-testid="admin-reply-send"><Send className="size-4" aria-hidden /></Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
