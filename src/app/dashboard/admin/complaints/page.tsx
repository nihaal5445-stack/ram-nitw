import { redirect } from "next/navigation";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileError } from "@/components/profile-error";
import { AdminConsole, type ConsoleIssue } from "@/components/complaints/admin-console";
import { messes } from "@/config/messes";
import { groupComplaints, type AdminComplaint } from "@/lib/complaints/group";
import { polishWithAi } from "@/lib/complaints/llm";

export const dynamic = "force-dynamic";

export default async function AdminComplaintsPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "mess_admin") redirect(roleDashboard[profile.role]);

  const { data } = await (await createClient()).rpc("admin_complaints");
  const rows = (data ?? []) as AdminComplaint[];
  const nameOf = (id: string) => messes.find((m) => m.id === id)?.name ?? id;

  const open = await polishWithAi(groupComplaints(rows.filter((r) => r.status === "open" || r.status === "in_progress"), nameOf), nameOf);
  const answered = rows.filter((r) => r.status === "resolved" || r.status === "cannot_resolve");

  const toConsole = (g: (typeof open)[number]): ConsoleIssue => ({
    key: g.key, title: `${g.topicLabel} · ${nameOf(g.messId)} · ${g.slot} · ${g.date}`, summary: g.summary, source: g.source,
    complaints: g.complaints.map((c) => ({ id: c.id, body: c.body, who: c.anonymous ? null : c.filer_name, slaDue: c.sla_due, draft: g.drafts[c.id] })),
  });
  return <AdminConsole issues={open.map(toConsole)} answered={answered.map((c) => ({
    id: c.id, body: c.body, status: c.status as "resolved" | "cannot_resolve", reply: c.reply ?? "", reason: c.cannot_reason, posted: !!c.posted_at,
    title: `${nameOf(c.mess_id)} · ${c.slot} · ${c.meal_date}`,
  }))} />;
}
