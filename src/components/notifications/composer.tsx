"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messes } from "@/config/messes";
import { ANNOUNCE_CATEGORIES, PUBLIC_CATEGORIES, type Category } from "./categories";

interface Posted { id: string; title: string; category: Category; pinned: boolean; expires_at: string | null; mess_ids: string[]; is_public: boolean; created_at: string; recipients: number; read_count: number }
const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const field = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Mess admin (own mess) and warden (one, several or all messes): post an announcement and see what was posted. */
export function Composer({ role, ownMess }: { role: "mess_admin" | "warden"; ownMess: string | null }) {
  const t = useTranslations("Notifications");
  const tc = useTranslations("Notifications.categories");
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [pinned, setPinned] = useState(false); const [expires, setExpires] = useState(""); const [isPublic, setIsPublic] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);       // warden: empty = all messes
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [posted, setPosted] = useState<Posted[]>([]);
  const canPublic = PUBLIC_CATEGORIES.includes(category);
  const confirmed = messes.filter((m) => m.status === "confirmed");

  const load = useCallback(async () => { const { data } = await createClient().rpc("my_announcements"); if (data) setPosted(data as Posted[]); }, []);
  useEffect(() => { const id = setTimeout(() => void load(), 0); return () => clearTimeout(id); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc("post_announcement", {
      p_title: title, p_body: body, p_category: category, p_pinned: pinned, p_expires: expires ? new Date(expires).toISOString() : null,
      p_mess_ids: role === "warden" && targets.length ? targets : null, p_public: canPublic && isPublic,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: t("sent", { n: data as number }) });
    setTitle(""); setBody(""); setPinned(false); setExpires(""); setIsPublic(false);
    await load();
  };
  const end = async (id: string) => { await createClient().rpc("end_announcement", { p_id: id }); await load(); };
  const nameOf = (id: string) => messes.find((m) => m.id === id)?.name ?? id;

  return (
    <section aria-labelledby="compose-title" className="space-y-4 rounded-lg border border-border bg-card p-4" data-testid="composer">
      <h2 id="compose-title" className="flex items-center gap-2 font-semibold"><Megaphone className="size-4 text-primary" aria-hidden />{t("composeTitle")}</h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">{t("fieldTitle")}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required minLength={3} data-testid="ann-title" /></label>
        <label className="space-y-1 text-sm sm:col-span-2">{t("fieldText")}
          <textarea className={field} rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required minLength={3} data-testid="ann-body" /></label>
        <label className="space-y-1 text-sm">{t("fieldCategory")}
          <select className={field} value={category} onChange={(e) => { setCategory(e.target.value as Category); setIsPublic(false); }} data-testid="ann-category">
            {ANNOUNCE_CATEGORIES.map((c) => <option key={c} value={c}>{tc(c)}</option>)}
          </select></label>
        <label className="space-y-1 text-sm">{t("fieldExpiry")}
          <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} data-testid="ann-expiry" /></label>
        <fieldset className="space-y-1 text-sm sm:col-span-2">
          <legend className="mb-1">{t("fieldTargets")}</legend>
          {role === "mess_admin" ? <p className="text-muted-foreground" data-testid="ann-targets-own">{t("ownMess", { mess: nameOf(ownMess ?? "") })}</p> : (
            <div className="flex flex-wrap gap-3" data-testid="ann-targets">
              {confirmed.map((m) => (
                <label key={m.id} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={targets.includes(m.id)} data-testid={`ann-target-${m.id}`}
                    onChange={() => setTargets((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))} />{m.name}
                </label>
              ))}
              <span className="text-xs text-muted-foreground">{targets.length === 0 ? t("allMesses") : t("someMesses", { n: targets.length })}</span>
            </div>
          )}
        </fieldset>
        <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={pinned} onChange={(e) => setPinned(e.target.checked)} data-testid="ann-pin" />{t("fieldPin")}</label>
          <label className={`inline-flex items-center gap-1.5 ${canPublic ? "" : "opacity-50"}`}><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={canPublic && isPublic} disabled={!canPublic} onChange={(e) => setIsPublic(e.target.checked)} data-testid="ann-public" />{t("fieldPublic")}</label>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy} data-testid="ann-send">{t("send")}</Button>
          {msg && <p role="status" data-testid="ann-result" className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
        </div>
      </form>

      <div>
        <h3 className="text-sm font-semibold">{t("postedTitle")}</h3>
        {posted.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{t("postedNone")}</p> : (
          <ul className="mt-2 divide-y divide-border text-sm" data-testid="posted-list">
            {posted.map((p) => {
              const over = p.expires_at && new Date(p.expires_at) <= new Date();
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium">{p.title}</span> <span className="text-xs text-muted-foreground">{tc(p.category)} · {p.mess_ids.map(nameOf).join(", ")} · {when(p.created_at)}{p.is_public ? ` · ${t("public")}` : ""}{p.pinned ? ` · ${t("pinned")}` : ""}</span></span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">{t("readOf", { read: p.read_count, n: p.recipients })}
                    {over ? <span>{t("ended")}</span> : <button type="button" onClick={() => void end(p.id)} className="underline" data-testid="ann-end">{t("endNow")}</button>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
