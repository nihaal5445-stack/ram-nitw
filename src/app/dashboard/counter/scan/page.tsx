import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { ScannerApp } from "@/components/access/scanner-app";
import { messes } from "@/config/messes";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ debug?: string }> }) {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "counter_staff" && profile.role !== "mess_admin") return <WrongRole role={profile.role} expected="counter_staff" />;

  const t = await getTranslations("Access.scanner");
  const sp = await searchParams;
  const mess = messes.find((m) => m.id === profile.assigned_mess_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      {mess ? <ScannerApp messName={mess.name} debug={sp.debug === "1"} /> : <p role="alert" className="rounded-md border border-warning p-4">{t("noMess")}</p>}
    </div>
  );
}
