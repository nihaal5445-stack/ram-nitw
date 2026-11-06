import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileError } from "@/components/profile-error";
import { ComplaintsView, type MyComplaint } from "@/components/complaints/complaints-view";
import { messes } from "@/config/messes";
import { recentDates } from "@/lib/access/slots";

export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "parent") redirect(roleDashboard[profile.role]);

  const supabase = await createClient();
  let defaultMess = profile.assigned_mess_id as string | null;
  if ((profile.role as string) === "parent" && profile.linked_student_id) {
    const { data } = await supabase.from("profiles").select("assigned_mess_id").eq("id", profile.linked_student_id).maybeSingle();
    defaultMess = data?.assigned_mess_id ?? null;
  }
  const { data } = await supabase.from("complaints")
    .select("id, mess_id, category, meal_date, slot, body, anonymous, status, reply, cannot_reason, complaint_events(kind, at, note)")
    .order("created_at", { ascending: false }).limit(30);
  const mine: MyComplaint[] = (data ?? []).map((c) => ({
    id: c.id, mess: c.mess_id, category: c.category, date: c.meal_date, slot: c.slot, body: c.body, anonymous: c.anonymous,
    status: c.status as MyComplaint["status"], reply: c.reply, cannotReason: c.cannot_reason,
    events: [...(c.complaint_events ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
  }));
  const confirmed = messes.filter((m) => m.status === "confirmed").map((m) => ({ id: m.id, name: m.name }));
  return <ComplaintsView messes={confirmed} defaultMess={defaultMess ?? confirmed[0].id} dates={recentDates(3)} complaints={mine} />;
}
