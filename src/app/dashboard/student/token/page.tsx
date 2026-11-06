import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileError } from "@/components/profile-error";
import { TokenView } from "@/components/access/token-view";

export default async function StudentTokenPage({ searchParams }: { searchParams: Promise<{ debug?: string }> }) {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") redirect(roleDashboard[profile.role]);

  const t = await getTranslations("Access.token");
  const supabase = await createClient();
  const { data: device } = await supabase
    .from("student_devices").select("id, device_key, label, created_at").is("revoked_at", null).maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <TokenView serverDevice={device} debug={(await searchParams).debug === "1"} />
    </div>
  );
}
