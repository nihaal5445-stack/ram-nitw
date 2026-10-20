import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";

export const dynamic = "force-dynamic";

export default async function DashboardRoot() {
  const { user, profile, error } = await getCurrentProfile();

  if (!user) {
    redirect("/login");
  }

  if (!profile) {
    return <ProfileError error={error} />;
  }

  redirect(roleDashboard[profile.role]);
}
