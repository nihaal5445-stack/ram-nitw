import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { CrowdPanel } from "@/components/crowd-panel";
import { ProfileError } from "@/components/profile-error";
import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, UtensilsCrossed, CalendarDays, AlertCircle } from "lucide-react";
import { messes } from "@/config/messes";

export default async function MessRepDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "mess_rep") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("MessRep");
  const tDash = await getTranslations("Dashboard");

  const assignedMess = messes.find((m) => m.id === profile?.assigned_mess_id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Mess Rep" })}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("title")} · {assignedMess?.name ?? "—"}
        </p>
      </div>

      <CrowdPanel ownMessId={profile.assigned_mess_id} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("openComplaints")} value="3" icon={AlertCircle} accent="primary" />
        <StatCard title="Resolved this week" value="7" icon={MessageSquare} accent="green" />
        <StatCard title="Menu submissions" value="4 / 4" icon={UtensilsCrossed} accent="secondary" />
        <StatCard title="Next submission due" value="Sun" icon={CalendarDays} accent="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Submit complaint CTA */}
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t("submitComplaint")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Complaint submission form available in Phase 5.
            </p>
            <Button disabled className="w-full bg-primary text-primary-foreground">
              New Complaint (Phase 5)
            </Button>
          </CardContent>
        </Card>

        {/* Weekly menu */}
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t("weeklyMenu")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
                <div key={day} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{day}</span>
                  <Badge variant="secondary">Draft</Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">Menu editor in Phase 3</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
