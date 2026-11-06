import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileError } from "@/components/profile-error";
import { WrongRole } from "@/components/wrong-role";
import { AddStudentForm, StudentsList } from "@/components/students/students-manager";
import { messes } from "@/config/messes";

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "mess_admin") return <WrongRole role={profile.role} expected="mess_admin" />;
  const t = await getTranslations("Students");
  const mess = messes.find((m) => m.id === profile.assigned_mess_id);
  const { data } = await (await createClient()).from("profiles").select("id, full_name, email, roll_number, assigned_mess_id").eq("role", "student").order("full_name");
  const list = messes.filter((m) => m.status === "confirmed").map((m) => ({ id: m.id, name: m.name }));
  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1><p className="mt-1 text-muted-foreground">{t("adminLead", { mess: mess?.name ?? "—" })}</p></div>
      <AddStudentForm messes={list} fixedMess={profile.assigned_mess_id ?? undefined} />
      <StudentsList warden={false} messes={list} students={(data ?? []).map((s) => ({ id: s.id, name: s.full_name, email: s.email, roll: s.roll_number, mess: s.assigned_mess_id }))} />
    </div>
  );
}
