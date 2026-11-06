"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPLAINTS_EVENT } from "@/components/complaints/admin-notifier";
import { draftReplies, postProgress, respondComplaint, type Outcome } from "@/app/actions/complaints";
import { cn } from "@/lib/utils";

export interface ConsoleIssue {
  key: string; title: string; summary: string; source: "rules" | "ai";
  complaints: { id: string; body: string; who: string | null; slaDue: string | null; draft: string }[];
}
export interface AnsweredRow { id: string; body: string; status: "resolved" | "cannot_resolve"; reply: string; reason: string | null; posted: boolean; title: string }

const mmss = (ms: number) => {
  const s = Math.abs(Math.floor(ms / 1000)); const h = Math.floor(s / 3600);
  return h ? `${h}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m` : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** SLA: 30 minutes after the meal window closes. Ticks every second. */
function Sla({ due, closes }: { due: string | null; closes?: boolean }) {
  const t = useTranslations("Complaints.admin");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  if (!due || now === null) return null;
  const left = Date.parse(due) - now;
  const windowStart = Date.parse(due) - 30 * 60_000; // the meal window closes 30 min before the deadline
  if (now < windowStart) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Timer className="size-3.5" aria-hidden />{t("slaOpen")}</span>;
  return (
    <span role="timer" className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", left < 0 ? "text-destructive" : left < 10 * 60_000 ? "text-warning" : "text-success")} data-testid={closes ? undefined : "sla"}>
      <Timer className="size-3.5" aria-hidden />{left < 0 ? t("slaOver", { time: mmss(left) }) : t("slaLeft", { time: mmss(left) })}
    </span>
  );
}

function ComplaintRow({ c, reply, setReply }: { c: ConsoleIssue["complaints"][number]; reply: string; setReply: (v: string) => void }) {
  const t = useTranslations("Complaints.admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const send = (outcome: "resolved" | "cannot_resolve") => {
    setErr(null);
    start(async () => {
      const r = await respondComplaint({ id: c.id, outcome, reply, reason });
      if (r.ok) router.refresh(); else setErr(r.error);
    });
  };
  return (
    <li className="space-y-2 rounded-md border border-border bg-background p-3" data-testid="console-complaint">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{c.who ?? t("anonymous")}</p>
        <Sla due={c.slaDue} />
      </div>
      <p className="text-sm">{c.body}</p>
      <Label htmlFor={`r-${c.id}`}>{t("reply")}</Label>
      <textarea id={`r-${c.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm" />
      {declining && (
        <div><Label htmlFor={`x-${c.id}`}>{t("cannotReason")}</Label>
          <Input id={`x-${c.id}`} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      )}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {!declining ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => send("resolved")} data-testid="send-resolved">{t("send")}</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>{t("cannot")}</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => send("cannot_resolve")} data-testid="send-decline">{t("sendDecline")}</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(false)}>{t("cancel")}</Button>
          </>
        )}
      </div>
    </li>
  );
}

function AnsweredItem({ a }: { a: AnsweredRow }) {
  const t = useTranslations("Complaints.admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(`Fixed: ${a.body.length > 90 ? a.body.slice(0, 87) + "..." : a.body}`.replace(/^Fixed: /, "Resolved: complaint about "));
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="space-y-2 rounded-md border border-border bg-card p-3 text-sm">
      <p className="font-medium">{a.title} · <span className={a.status === "resolved" ? "text-success" : "text-destructive"}>{a.status === "resolved" ? "Resolved" : "Cannot be resolved"}</span></p>
      <p className="text-muted-foreground">{a.reply}</p>
      {a.reason && <p className="text-muted-foreground">Reason: {a.reason}</p>}
      {a.status === "resolved" && (a.posted ? <p className="text-xs font-medium text-success">{t("posted")}</p> : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1"><Label htmlFor={`p-${a.id}`}>{t("postText")}</Label><Input id={`p-${a.id}`} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await postProgress({ id: a.id, text }); if (r.ok) router.refresh(); else setErr(r.error); })} data-testid="post-progress">{t("postBtn")}</Button>
        </div>
      ))}
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
    </li>
  );
}

function IssueCard({ g }: { g: ConsoleIssue }) {
  const t = useTranslations("Complaints.admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [replies, setReplies] = useState<Record<string, string>>(() => Object.fromEntries(g.complaints.map((c) => [c.id, c.draft])));
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("resolved");
  const [drafted, setDrafted] = useState<"ai" | "template" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const draft = () => {
    setMsg(null);
    if (note.trim().length < 10) { setMsg({ ok: false, text: t("noteRequired") }); return; }
    start(async () => {
      const r = await draftReplies({ ids: g.complaints.map((c) => c.id), note, outcome });
      if (!r.ok) { setMsg({ ok: false, text: t("noteRequired") }); return; }
      setReplies((prev) => ({ ...prev, ...r.replies })); setDrafted(r.source);
    });
  };
  const sendAll = () => start(async () => {
    setMsg(null);
    let failed = 0;
    for (const c of g.complaints) {
      const r = await respondComplaint({ id: c.id, outcome, reply: replies[c.id], reason: outcome === "cannot_resolve" ? note : undefined });
      if (!r.ok) failed++;
    }
    setMsg(failed ? { ok: false, text: t("sendFailed") } : { ok: true, text: t("sentAll") });
    router.refresh();
  });

  return (
    <article className="space-y-3 rounded-lg border-2 border-border bg-card p-4" data-testid="issue">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{g.title}</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground"><Users className="size-3.5" aria-hidden />{t("reports", { n: g.complaints.length })}</span>
      </div>
      <p className="flex items-start gap-2 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /><span>{g.summary} <em className="text-xs text-muted-foreground">({t(g.source === "ai" ? "source_ai" : "source_rules")})</em></span></p>

      <div className="space-y-3 rounded-md border border-dashed border-border p-3" data-testid="explain-box">
        <Label htmlFor={`note-${g.key}`}>{t("noteLabel")}</Label>
        <textarea id={`note-${g.key}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className="w-full rounded-md border border-input bg-background p-2 text-sm" data-testid="issue-note" />
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">{t("outcome")}</legend>
          {(["resolved", "in_progress", "cannot_resolve"] as Outcome[]).map((o) => (
            <label key={o} className="flex items-center gap-1.5"><input type="radio" name={`o-${g.key}`} checked={outcome === o} onChange={() => setOutcome(o)} data-testid={`outcome-${o}`} />{t(o === "resolved" ? "outcomeResolved" : o === "in_progress" ? "outcomeInProgress" : "outcomeCannot")}</label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={draft} disabled={pending} data-testid="draft-replies">{pending ? t("drafting") : t("draft")}</Button>
          {drafted && <span className="text-xs text-muted-foreground">{t(drafted === "ai" ? "draftSourceAi" : "draftSourceTemplate")}</span>}
        </div>
        {drafted && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("previewTitle")}</p>
            <Button size="sm" onClick={sendAll} disabled={pending} data-testid="send-all">{t("sendAll", { n: g.complaints.length })}</Button>
          </div>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
      </div>

      <ul className="space-y-3">{g.complaints.map((c) => <ComplaintRow key={c.id} c={c} reply={replies[c.id]} setReply={(v) => setReplies((p) => ({ ...p, [c.id]: v }))} />)}</ul>
    </article>
  );
}

export function AdminConsole({ issues, answered, messName }: { issues: ConsoleIssue[]; answered: AnsweredRow[]; messName?: string }) {
  const t = useTranslations("Complaints.admin");
  const tl = useTranslations("Complaints.live");
  const router = useRouter();
  // a new complaint arrives (Realtime): re-render the server data in place, no manual refresh
  useEffect(() => {
    const on = () => router.refresh();
    window.addEventListener(COMPLAINTS_EVENT, on);
    return () => window.removeEventListener(COMPLAINTS_EVENT, on);
  }, [router]);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
        {messName && <p className="mt-1 text-sm font-medium" data-testid="console-scope">{tl("scope", { mess: messName })}</p>}
      </div>
      <section aria-labelledby="open-issues" className="space-y-4">
        <h2 id="open-issues" className="text-lg font-semibold">{t("openIssues")}</h2>
        {issues.length === 0 && <p className="text-muted-foreground">{t("noOpen")}</p>}
        {issues.map((g) => <IssueCard key={g.key} g={g} />)}
      </section>
      {answered.length > 0 && (
        <section aria-labelledby="answered" className="space-y-3">
          <h2 id="answered" className="text-lg font-semibold">{t("answered")}</h2>
          <ul className="space-y-3">{answered.map((a) => <AnsweredItem key={a.id} a={a} />)}</ul>
        </section>
      )}
    </div>
  );
}
