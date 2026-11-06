import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { FeeCharts } from "@/components/fees/fee-charts";

export default async function StudentFeesPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") return <WrongRole role={profile.role} expected="student" />;
  const t = await getTranslations("Fees");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>
      <p className="inline-block rounded-md border border-warning bg-warning/15 px-3 py-2 text-sm font-medium">{t("demoBanner")}</p>
      <FeeCharts />
    </div>
  );
}
