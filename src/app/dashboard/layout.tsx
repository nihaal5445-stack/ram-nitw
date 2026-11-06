import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { Navbar } from "@/components/navbar";
import { ProfileError } from "@/components/profile-error";
import { ContactAdmin } from "@/components/messages/contact-admin";
import { AdminNotifier } from "@/components/complaints/admin-notifier";
import { DemoBadge } from "@/components/demo-badge";
import { FeedbackBanner } from "@/components/feedback/feedback-bell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, error } = await getCurrentProfile();

  if (!user) {
    redirect("/login");
  }

  if (!profile) {
    return <ProfileError error={error} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar
        userName={profile.full_name ?? user.email ?? "User"}
        role={profile.role}
        badge={<><DemoBadge />{profile.role === "mess_admin" && profile.assigned_mess_id && <AdminNotifier messId={profile.assigned_mess_id} />}</>}
      />
      {profile.role === "student" && <FeedbackBanner />}
      {profile.role === "student" && <ContactAdmin />}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 ${profile.role === "student" ? "pb-24 md:pb-8" : ""}`}>
        {children}
      </main>
    </div>
  );
}
