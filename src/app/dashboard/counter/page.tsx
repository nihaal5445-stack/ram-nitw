import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle, Clock, Keyboard, RefreshCw, ScanLine } from "lucide-react";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { CrowdPanel } from "@/components/crowd-panel";
import { ProfileError } from "@/components/profile-error";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { messes } from "@/config/messes";
import { currentSlot } from "@/lib/access/slots";
import { getDemoMode } from "@/lib/demo-mode";

export default async function CounterDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "counter_staff") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("CounterStaff");
  const tDash = await getTranslations("Dashboard");
  const tm = await getTranslations("Public.meals");
  const locale = await getLocale();
  const assignedMess = messes.find((m) => m.id === profile.assigned_mess_id);

  // Real data (RLS scopes redemptions and scanners to this mess / this staff member).
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [{ data: slotRows }, { data: todayRows }, { data: recent }, { data: scanner }] = await Promise.all([
    supabase.from("mess_slots").select("slot, starts, ends").eq("mess_id", profile.assigned_mess_id ?? ""),
    supabase.from("meal_redemptions").select("method").eq("status", "accepted").eq("meal_date", today),
    supabase.from("meal_redemptions").select("id, slot, scanned_at, method, status").order("scanned_at", { ascending: false }).limit(8),
    supabase.from("scanner_devices").select("last_sync_at").order("last_sync_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  const current = currentSlot((slotRows ?? []).map((s) => ({ slot: s.slot, starts: s.starts.slice(0, 5), ends: s.ends.slice(0, 5) })), await getDemoMode());
  const served = todayRows?.length ?? 0;
  const manual = (todayRows ?? []).filter((r) => r.method === "manual").length;
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const stamp = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">{tDash("welcome", { name: profile.full_name ?? "Counter Staff" })}</h1>
        <p className="text-muted-foreground mt-1">{t("title")} · {assignedMess?.name ?? "—"}</p>
      </div>

      <CrowdPanel ownMessId={profile.assigned_mess_id} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("currentSlot")} value={current ? tm(current.slot as "lunch") : t("noMealNow")} icon={Clock} accent="secondary" />
        <StatCard title={t("todayCount")} value={String(served)} icon={CheckCircle} accent="green" />
        <StatCard title={t("manualToday")} value={String(manual)} icon={Keyboard} accent="amber" description={t("manualTodayDesc")} />
        <StatCard title={t("lastSync")} value={scanner?.last_sync_at ? time.format(new Date(scanner.last_sync_at)) : t("never")} icon={RefreshCw} accent="primary" />
      </div>

      <Link href="/dashboard/counter/scan" className="flex items-center gap-4 rounded-lg border-2 border-primary/40 bg-primary/5 p-6 transition-colors hover:bg-primary/10">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ScanLine className="size-7" aria-hidden /></span>
        <span>
          <span className="block text-lg font-semibold">{t("openScanner")}</span>
          <span className="block text-sm text-muted-foreground">{t("openScannerDesc")}</span>
        </span>
      </Link>

      <Card className="border border-border shadow-sm">
        <CardHeader><CardTitle className="text-base font-semibold">{t("recentScans")}</CardTitle></CardHeader>
        <CardContent>
          {(recent ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noScansYet")}</p>
          ) : (
            <ul>
              {recent!.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <span className="text-sm">{r.slot ? tm(r.slot as "lunch") : "—"} <span className="ml-2 text-xs text-muted-foreground">{stamp.format(new Date(r.scanned_at))}</span></span>
                  <span className="flex gap-2">
                    {r.method === "manual" && <Badge variant="secondary">{t("manualTag")}</Badge>}
                    <Badge variant={r.status === "accepted" ? "default" : "secondary"}>{t(`status.${r.status}`)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("privacyNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
