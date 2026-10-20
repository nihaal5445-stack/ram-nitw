import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";
import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Utensils, Wallet, CalendarDays, History } from "lucide-react";
import { messes } from "@/config/messes";

export default async function StudentDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("Student");
  const tDash = await getTranslations("Dashboard");

  const assignedMess = messes.find((m) => m.id === profile?.assigned_mess_id);

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Student" })}
        </h1>
        <p className="text-muted-foreground mt-1">{t("title")}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("balance")}
          value="₹ 2,450"
          icon={Wallet}
          description="As of today"
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
          value="2 / 3"
          icon={CalendarDays}
          description="Breakfast ✓  Lunch ✓  Dinner —"
          accent="green"
        />
        <StatCard
          title="Meals this month"
          value="48"
          icon={History}
          description="Out of 90 possible"
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
          <div className="space-y-3">
            {[
              { date: "Today", meal: "Lunch", status: "served" },
              { date: "Today", meal: "Breakfast", status: "served" },
              { date: "Yesterday", meal: "Dinner", status: "served" },
              { date: "Yesterday", meal: "Lunch", status: "absent" },
              { date: "Yesterday", meal: "Breakfast", status: "served" },
            ].map((entry, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div>
                  <span className="text-sm font-medium">{entry.meal}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {entry.date}
                  </span>
                </div>
                <Badge
                  variant={entry.status === "served" ? "default" : "secondary"}
                  className={
                    entry.status === "served"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                      : ""
                  }
                >
                  {entry.status === "served" ? "Served" : "Absent"}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Live meal history available in Phase 3
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
