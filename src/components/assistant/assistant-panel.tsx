"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Msg { role: "user" | "bot"; text: string; source?: "ai" | "offline" }

export function AssistantPanel({ chips }: { chips: string[] }) {
  const t = useTranslations("Assistant");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: question }]); setQ(""); setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const j = (await r.json()) as { answer?: string; source?: "ai" | "offline"; error?: string };
      setMsgs((m) => [...m, { role: "bot", text: r.ok ? j.answer ?? "" : t(`errors.${j.error === "rate_limited" ? "rate" : "default"}`), source: r.ok ? j.source : undefined }]);
    } catch { setMsgs((m) => [...m, { role: "bot", text: t("errors.default") }]); }
    setBusy(false);
    setTimeout(() => end.current?.scrollIntoView({ block: "nearest" }), 0);
  };

  return (
    <Card className="border border-border shadow-sm" data-testid="assistant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold"><Bot className="size-4 text-primary" aria-hidden />{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label={t("chips")}>
          {chips.map((c) => <button key={c} type="button" onClick={() => ask(c)} disabled={busy} className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted" data-testid="assistant-chip">{c}</button>)}
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto" role="log" aria-live="polite" data-testid="assistant-log">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[90%] rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"}>
                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                  {m.role === "user" ? <User className="size-3" aria-hidden /> : <Bot className="size-3" aria-hidden />}
                  {m.role === "user" ? t("you") : m.source === "offline" ? t("offline") : m.source === "ai" ? t("ai") : t("assistant")}
                </p>
                <p className="whitespace-pre-line" data-testid={m.role === "bot" ? "assistant-answer" : undefined}>{m.text}</p>
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-muted-foreground">{t("thinking")}</p>}
          <div ref={end} />
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder={t("placeholder")} aria-label={t("placeholder")} data-testid="assistant-input" />
          <Button type="submit" disabled={busy || q.trim().length < 3} aria-label={t("send")}><Send className="size-4" aria-hidden /></Button>
        </form>
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      </CardContent>
    </Card>
  );
}
