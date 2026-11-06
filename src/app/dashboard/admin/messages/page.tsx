import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";
import { AdminInbox } from "@/components/messages/admin-inbox";

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "mess_admin") redirect(roleDashboard[profile.role]);
  return <AdminInbox />;
}
