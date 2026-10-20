import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { Navbar } from "@/components/navbar";
import { ProfileError } from "@/components/profile-error";

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
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
