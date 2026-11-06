import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { CrowdPanel } from "@/components/crowd-panel";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, User, History, CalendarDays, MessageSquareWarning } from "lucide-react";
import Link from "next/link";

export default async function ParentDashboard() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "parent") return <WrongRole role={profile.role} expected="parent" />;

  const supabase = await createClient();

  const t = await getTranslations("Parent");
  const tDash = await getTranslations("Dashboard");

  // Fetch linked student profile (RLS allows this via "parent sees linked student" policy)
  let studentProfile: { full_name: string | null; assigned_mess_id: string | null } | null = null;
  if (profile?.linked_student_id) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, assigned_mess_id")
      .eq("id", profile.linked_student_id)
      .single();
    studentProfile = data;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-primary">
          {tDash("welcome", { name: profile?.full_name ?? "Parent" })}
        </h1>
        <p className="text-muted-foreground mt-1">{t("title")}</p>
      </div>

      <CrowdPanel ownMessId={studentProfile?.assigned_mess_id} />

      {/* Linked student info */}
      {studentProfile ? (
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary text-secondary-foreground font-semibold">
                {studentProfile.full_name?.[0] ?? "S"}
              </div>
              <div>
                <p className="font-semibold">{studentProfile.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {t("linkedTo")} · Mess: {studentProfile.assigned_mess_id ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No student linked to this account. Contact the warden.
          </CardContent>
        </Card>
      )}
      <Link href="/dashboard/parent/complaints" className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/50">
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><MessageSquareWarning className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">File or follow a complaint</span>
          <span className="block text-sm text-muted-foreground">Tell the mess administration about a problem and see their reply.</span>
        </span>
      </Link>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("balance")} value="₹ 2,450" icon={Wallet} accent="primary" />
        <StatCard title="Meals this week" value="12" icon={CalendarDays} accent="secondary" />
        <StatCard title="Last meal" value="Lunch today" icon={History} accent="green" />
        <StatCard title="Attendance %" value="86%" icon={User} accent="amber" />
      </div>

      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">{t("recentHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { date: "Today", meal: "Lunch", status: "served" },
              { date: "Today", meal: "Breakfast", status: "served" },
              { date: "Yesterday", meal: "Dinner", status: "absent" },
            ].map((entry, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="text-sm font-medium">{entry.meal}</span>
                  <span className="text-xs text-muted-foreground ml-2">{entry.date}</span>
                </div>
                <Badge variant={entry.status === "served" ? "default" : "secondary"}
                  className={entry.status === "served" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : ""}>
                  {entry.status === "served" ? "Served" : "Absent"}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">Live data available in Phase 3</p>
        </CardContent>
      </Card>
    </div>
  );
}
