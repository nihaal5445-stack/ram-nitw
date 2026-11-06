import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { CrowdPanel } from "@/components/crowd-panel";
import { StudentMenu } from "@/components/likes/student-menu";
import { SwitchMess } from "@/components/switch/switch-mess";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { getLocale, getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Utensils, Wallet, CalendarDays, History, QrCode, Soup, MessageSquareWarning, PieChart } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { messes } from "@/config/messes";

export default async function StudentDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") return <WrongRole role={profile.role} expected="student" />;

  const t = await getTranslations("Student");
  const tDash = await getTranslations("Dashboard");

  const assignedMess = messes.find((m) => m.id === profile?.assigned_mess_id);
  const tm = await getTranslations("Public.meals");
  const locale = await getLocale();

  // Real meal data (RLS limits these rows to this student).
  const supabase = await createClient();
  const switchAllowed = (await supabase.rpc("mess_switch_allowed")).data === true;
  const { data: passRow } = await supabase.from("mess_switch_passes").select("id, to_mess, slot").eq("status", "issued").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const activePass = passRow ? { id: passRow.id, toMess: passRow.to_mess, slot: passRow.slot } : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ data: recent }, { data: todayRows }, { count: monthCount }] = await Promise.all([
    supabase.from("meal_redemptions").select("id, slot, meal_date, scanned_at, method").eq("status", "accepted").order("scanned_at", { ascending: false }).limit(8),
    supabase.from("meal_redemptions").select("slot").eq("status", "accepted").eq("meal_date", today),
    supabase.from("meal_redemptions").select("id", { count: "exact", head: true }).eq("status", "accepted").gte("meal_date", monthStart),
  ]);
  const slots = ["breakfast", "lunch", "snacks", "dinner"] as const;
  const servedToday = new Set((todayRows ?? []).map((r) => r.slot));
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Student" })}
        </h1>
        <p className="text-muted-foreground mt-1">{t("title")}</p>
      </div>

      {/* Meal QR entry point */}
      <Link href="/dashboard/student/token" className="flex items-center gap-4 rounded-lg border-2 border-primary/40 bg-primary/5 p-5 transition-colors hover:bg-primary/10">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><QrCode className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">{t("showQr")}</span>
          <span className="block text-sm text-muted-foreground">{t("showQrDesc")}</span>
        </span>
      </Link>

      {/* Today's full menu: right under the QR entry point, expanded by default */}
      {profile.assigned_mess_id && <StudentMenu messId={profile.assigned_mess_id} vegOnly={profile.assigned_mess_id === "ifc-a"} />}

      <div className="grid gap-4 sm:grid-cols-3">
      <Link href="/dashboard/student/extras" className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50">
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Soup className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">{t("addonsLink")}</span>
          <span className="block text-sm text-muted-foreground">{t("addonsDesc")}</span>
        </span>
      </Link>

      <Link href="/dashboard/student/complaints" className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50">
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><MessageSquareWarning className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">{t("complaintsLink")}</span>
          <span className="block text-sm text-muted-foreground">{t("complaintsDesc")}</span>
        </span>
      </Link>

      <Link href="/dashboard/student/fees" className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50">
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><PieChart className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">{t("feesLink")}</span>
          <span className="block text-sm text-muted-foreground">{t("feesDesc")}</span>
        </span>
      </Link>
      </div>

      <CrowdPanel ownMessId={profile.assigned_mess_id} />

      {profile.assigned_mess_id && <SwitchMess ownMess={profile.assigned_mess_id} allowed={switchAllowed} activePass={activePass} />}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("balance")}
          value="₹ 2,450"
          icon={Wallet}
          description={t("balancePlaceholder")}
          accent="primary"
        />
        <StatCard
          title={t("mess")}
          value={assignedMess?.name ?? "—"}
          icon={Utensils}
          description={assignedMess?.menuStyle ?? ""}
          accent="secondary"
        />
        <StatCard
          title={t("todayMeals")}
          value={`${servedToday.size} / ${slots.length}`}
          icon={CalendarDays}
          description={slots.map((k) => `${tm(k)} ${servedToday.has(k) ? "✓" : "–"}`).join("  ")}
          accent="green"
        />
        <StatCard
          title={t("monthMeals")}
          value={String(monthCount ?? 0)}
          icon={History}
          description={t("monthMealsDesc")}
          accent="amber"
        />
      </div>

      {/* Recent history placeholder */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t("recentHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(recent ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-1">
              {recent!.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <span>
                    <span className="text-sm font-medium">{tm(r.slot as (typeof slots)[number])}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{fmt.format(new Date(r.scanned_at))}</span>
                  </span>
                  <Badge variant="secondary">{r.method === "manual" ? t("manualTag") : t("servedTag")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
