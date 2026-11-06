import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileError } from "@/components/profile-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messes } from "@/config/messes";
import { resolveFlag } from "./actions";

const HIGH = new Set(["duplicate_cross_scanner", "bad_signature", "revoked_device", "manual_overuse"]);

export default async function FraudPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "warden") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("Warden.fraud");
  const locale = await getLocale();
  const showAll = (await searchParams).all === "1";

  const supabase = await createClient();
  let q = supabase.from("fraud_flags").select("id, kind, student_id, mess_id, redemption_ids, details, created_at, resolved_at, note").order("created_at", { ascending: false }).limit(200);
  if (!showAll) q = q.is("resolved_at", null);
  const { data: flags } = await q;
  const ids = [...new Set((flags ?? []).map((f) => f.student_id).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, roll_number").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 max-w-[70ch] text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-3 text-sm">
          <Link className="text-brand underline underline-offset-4" href={showAll ? "/dashboard/warden/fraud" : "/dashboard/warden/fraud?all=1"}>{showAll ? t("showOpen") : t("showAll")}</Link>
        </p>
      </div>

      {(flags ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="space-y-3" data-testid="fraud-list">
          {flags!.map((f) => {
            const p = f.student_id ? who.get(f.student_id) : null;
            const high = HIGH.has(f.kind);
            const mess = messes.find((m) => m.id === f.mess_id)?.name ?? f.mess_id ?? "—";
            const d = f.details as Record<string, string | number | null>;
            return (
              <li key={f.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {f.resolved_at ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : high ? <AlertOctagon className="size-4 text-destructive" aria-hidden /> : <AlertTriangle className="size-4 text-warning" aria-hidden />}
                      {t(`kinds.${f.kind}`)}
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal">{high ? t("high") : t("medium")}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{t(`explain.${f.kind}`)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{fmt.format(new Date(f.created_at))}</p>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("student")}</dt><dd>{p ? `${p.full_name ?? "—"} (${p.roll_number ?? "—"})` : "—"}</dd></div>
                  <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("mess")}</dt><dd>{mess}</dd></div>
                  <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("evidence")}</dt><dd className="break-words font-mono text-xs">{[d.first_scan && `first ${fmt.format(new Date(String(d.first_scan)))}`, d.duplicate_scan && `second ${fmt.format(new Date(String(d.duplicate_scan)))}`, d.age_steps && `${Number(d.age_steps) * 30}s old`, d.limit && String(d.limit)].filter(Boolean).join(" · ") || "—"}</dd></div>
                </dl>
                {f.resolved_at ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("resolvedWith", { note: f.note ?? "" })}</p>
                ) : (
                  <form action={resolveFlag} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={f.id} />
                    <Input name="note" required minLength={3} placeholder={t("notePlaceholder")} aria-label={t("notePlaceholder")} className="h-9 max-w-sm flex-1" />
                    <Button type="submit" size="sm" variant="outline">{t("resolve")}</Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
