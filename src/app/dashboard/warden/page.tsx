import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, ShieldCheck, Activity } from "lucide-react";
import Link from "next/link";
import { AlertOctagon } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { messes } from "@/config/messes";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { TopLiked } from "@/components/likes/top-liked";
import { CrowdPanel } from "@/components/crowd-panel";
import { SwitchToggle } from "@/components/switch/switch-toggle";
import { getDemoMode } from "@/lib/demo-mode";

export default async function WardenDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "warden") return <WrongRole role={profile.role} expected="warden" />;

  const t = await getTranslations("Warden");
  const tDash = await getTranslations("Dashboard");

  const { count: openFlags } = await (await createClient()).from("fraud_flags").select("id", { count: "exact", head: true }).is("resolved_at", null);
  const sb = await createClient();
  const switchOn = (await sb.rpc("mess_switch_allowed")).data === true;
  const demo = await getDemoMode();
  const { data: passRows } = await sb.from("mess_switch_passes").select("status");
  const issued = passRows?.length ?? 0, redeemed = (passRows ?? []).filter((p) => p.status === "redeemed").length;
  const operationalMesses = messes.filter((m) => m.status === "confirmed");
  const underConstructionMesses = messes.filter((m) => m.status === "under_construction");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Warden" })}
        </h1>
        <p className="text-muted-foreground mt-1">{t("title")}</p>
      </div>

      <Link href="/dashboard/warden/fraud" className="flex items-center gap-4 rounded-lg border-2 border-primary/40 bg-primary/5 p-5 transition-colors hover:bg-primary/10">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><AlertOctagon className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">{t("fraud.cardTitle", { n: openFlags ?? 0 })}</span>
          <span className="block text-sm text-muted-foreground">{t("fraud.cardDesc")}</span>
        </span>
      </Link>

      <SwitchToggle on={switchOn} demo={demo} issued={issued} redeemed={redeemed} />

      <CrowdPanel />

      <TopLiked showMess />

      <AssistantPanel chips={["What are the top issues at IFC-B this week?", "What should we fix first?", "How are complaints trending?", "Which messes are busiest right now?"]} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("allMesses")}
          value={operationalMesses.length}
          icon={Building2}
          description={`confirmed; ${messes.length - operationalMesses.length - underConstructionMesses.length} unconfirmed, ${underConstructionMesses.length} under construction`}
          accent="primary"
        />
        <StatCard
          title={t("totalStudents")}
          value="4,850"
          icon={Users}
          description="Enrolled in messes"
          accent="secondary"
        />
        <StatCard
          title={t("systemHealth")}
          value="99.9%"
          icon={Activity}
          description="Zero downtime"
          accent="green"
        />
        <StatCard
          title={t("userManagement")}
          value="6 Roles"
          icon={ShieldCheck}
          description="RLS enforced"
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mess overview table */}
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t("allMesses")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {messes.map((mess) => (
                <div
                  key={mess.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <span className="text-sm font-medium">{mess.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      Cap: {mess.capacity} · {mess.menuStyle}
                    </span>
                  </div>
                  <Badge
                    variant={mess.status === "confirmed" ? "default" : "secondary"}
                    className={
                      mess.status === "confirmed"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
                    }
                  >
                    {mess.status === "confirmed" ? "Confirmed" : mess.status === "unconfirmed" ? "Unconfirmed" : "Under Construction"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* User management CTA */}
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t("userManagement")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wardens can assign and modify user roles across the platform. Wardens have full update access granted via Supabase RLS.
            </p>
            <div className="rounded-lg bg-muted p-4 space-y-2 text-xs text-muted-foreground">
              <p>• <strong>Student:</strong> Auto-assigned for @student.nitw.ac.in emails</p>
              <p>• <strong>Parent:</strong> Default role for external emails, linked to student</p>
              <p>• <strong>Staff / Admins / Wardens:</strong> Promoted by existing wardens</p>
            </div>
            <Button disabled className="w-full bg-primary text-primary-foreground">
              Manage Roles & Permissions (Phase 6)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
