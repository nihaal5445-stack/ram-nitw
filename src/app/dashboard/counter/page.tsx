import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";
import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScanLine, Users, Clock, CheckCircle } from "lucide-react";
import { messes } from "@/config/messes";

export default async function CounterDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "counter_staff") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("CounterStaff");
  const tDash = await getTranslations("Dashboard");

  const assignedMess = messes.find((m) => m.id === profile?.assigned_mess_id);
  const now = new Date();
  const hour = now.getHours();
  const currentSlot = hour < 9 ? "Breakfast" : hour < 14 ? "Lunch" : "Dinner";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Counter Staff" })}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("title")} · {assignedMess?.name ?? "—"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("currentSlot")} value={currentSlot} icon={Clock} accent="secondary" />
        <StatCard title={t("todayCount")} value="342" icon={Users} accent="primary" />
        <StatCard title="Tokens verified" value="342" icon={CheckCircle} accent="green" />
        <StatCard title="Avg. scan time" value="1.2s" icon={ScanLine} accent="amber" />
      </div>

      {/* Scan CTA — Phase 2 will wire the QR scanner */}
      <Card className="border-2 border-dashed border-primary/40 bg-primary/5 shadow-none">
        <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ScanLine className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">{t("scanToken")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              QR scanner available in Phase 2
            </p>
          </div>
          <Button disabled className="bg-primary text-primary-foreground px-8">
            Open Scanner (Phase 2)
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {["21BCS001", "21BCS042", "21BCS118", "21BEE077"].map((roll, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm font-mono">{roll}</span>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Verified</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">Live data in Phase 2</p>
        </CardContent>
      </Card>
    </div>
  );
}
