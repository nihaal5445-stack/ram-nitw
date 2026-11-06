import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";
import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, UtensilsCrossed, BarChart3 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { messes } from "@/config/messes";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { TopLiked } from "@/components/likes/top-liked";
import { CrowdPanel } from "@/components/crowd-panel";

export default async function MessAdminDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "mess_admin") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("MessAdmin");
  const tDash = await getTranslations("Dashboard");

  const inbox = ((await (await createClient()).rpc("admin_inbox")).data ?? []) as { unread: number }[];
  const unreadMsgs = inbox.reduce((a, r) => a + r.unread, 0);
  const assignedMess = messes.find((m) => m.id === profile?.assigned_mess_id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Mess Admin" })}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("title")} · {assignedMess?.name ?? "—"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("todayHeadcount")} value="784" icon={Users} accent="primary" />
        <StatCard title={t("staffCount")} value="12" icon={TrendingUp} accent="secondary" />
        <StatCard title="Open complaints" value="3" icon={UtensilsCrossed} accent="amber" />
        <StatCard title="Avg. daily headcount" value="720" icon={BarChart3} accent="green" />
      </div>

      <CrowdPanel ownMessId={profile.assigned_mess_id} />

      <TopLiked />

      <AssistantPanel chips={[`What are the top issues at ${assignedMess?.name ?? "my mess"} this week?`, "What should we fix first?", "Which dishes do students like most?", "How crowded is it right now?"]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t("menuManagement")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Approve and publish weekly menus submitted by the mess rep.</p>
            <Button disabled className="bg-primary text-primary-foreground w-full">
              Manage Menu (Phase 3)
            </Button>
            <Link href="/dashboard/admin/addons" className="block rounded-md border border-primary/40 bg-primary/5 p-3 text-center text-sm font-semibold hover:bg-primary/10">
              Add-ons: stock and prices
            </Link>
            <Link href="/dashboard/admin/messages" className="block rounded-md border border-primary/40 bg-primary/5 p-3 text-center text-sm font-semibold hover:bg-primary/10" data-testid="inbox-link">
              Messages inbox{unreadMsgs > 0 ? ` (${unreadMsgs} new)` : ""}
            </Link>
            <Link href="/dashboard/admin/complaints" className="block rounded-md border border-primary/40 bg-primary/5 p-3 text-center text-sm font-semibold hover:bg-primary/10">
              Complaints console
            </Link>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{t("reports")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {["Daily Headcount Report", "Monthly Attendance Summary", "Complaint Resolution Log"].map((r) => (
                <div key={r} className="text-sm py-2 border-b border-border last:border-0 text-muted-foreground">
                  {r} <span className="text-xs">(Phase 6)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
