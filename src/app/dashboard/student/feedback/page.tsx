import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";
import { FeedbackView } from "@/components/feedback/feedback-view";

export const dynamic = "force-dynamic";

export default async function StudentFeedbackPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") redirect(roleDashboard[profile.role]);
  return <FeedbackView />;
}
