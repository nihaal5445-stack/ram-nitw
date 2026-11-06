import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { ProfileError } from "@/components/profile-error";
import { Inbox } from "@/components/notifications/inbox";
import { Composer } from "@/components/notifications/composer";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  const t = await getTranslations("Notifications");
  const staff = profile.role === "mess_admin" || profile.role === "warden";
  const receives = profile.role === "student" || profile.role === "parent";
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t(receives ? "subtitle" : "subtitleStaff")}</p>
      </div>
      {staff && <Composer role={profile.role as "mess_admin" | "warden"} ownMess={profile.assigned_mess_id ?? null} />}
      <Inbox showSettings={receives} />
    </div>
  );
}
