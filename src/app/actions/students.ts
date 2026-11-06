"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";

const MSG: [string, string][] = [
  ["bad_email", "Use the student's @student.nitw.ac.in address."], ["bad_name", "Enter the student's name (2 to 80 characters)."],
  ["bad_roll", "The roll number must be 4 to 15 letters or digits."], ["roll_taken", "That roll number is already used by another student."],
  ["in_other_mess", "That student is already in another mess. Ask the warden to move them."], ["already_in_mess", "That student is already in this mess."],
  ["wrong_mess", "You can only manage students of your own mess."], ["not_a_student", "That account is not a student."], ["bad_mess", "Choose a mess."],
];
const friendly = (m: string) => MSG.find(([k]) => m.includes(k))?.[1] ?? "Could not do that.";

/** Mess admin: add to their own mess. Warden: add to any mess (`mess` required). New accounts go through the allow-list, then the auth user is created. */
export async function addStudent(input: { email: string; name: string; roll: string; mess?: string }) {
  const { user, profile } = await getCurrentProfile();
  if (!user || (profile?.role !== "mess_admin" && profile?.role !== "warden")) return { ok: false as const, error: "Not allowed." };
  const db = await createClient();
  const { data, error } = await db.rpc("admin_add_student", { p_email: input.email, p_name: input.name, p_roll: input.roll, p_mess: profile.role === "warden" ? input.mess ?? null : null });
  if (error) return { ok: false as const, error: friendly(error.message) };
  const r = data as { action: "create_account" | "assigned_existing"; email?: string };
  if (r.action === "create_account") {
    const { error: createErr } = await createAdminClient().auth.admin.createUser({ email: input.email.trim().toLowerCase(), email_confirm: true, user_metadata: { full_name: input.name.trim() } });
    if (createErr) {
      await db.rpc("admin_cancel_student_invite", { p_email: input.email });
      return { ok: false as const, error: /already|registered|exists/i.test(createErr.message) ? "An account with this email already exists." : "Could not create the account." };
    }
  }
  return { ok: true as const, action: r.action };
}

export async function removeStudent(studentId: string) {
  const { user } = await getCurrentProfile();
  if (!user) return { ok: false as const, error: "Not allowed." };
  const { error } = await (await createClient()).rpc("admin_remove_student", { p_student: studentId });
  return error ? { ok: false as const, error: friendly(error.message) } : { ok: true as const };
}

export async function moveStudent(studentId: string, mess: string) {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "warden") return { ok: false as const, error: "Only the warden can move students." };
  const { error } = await (await createClient()).rpc("warden_move_student", { p_student: studentId, p_mess: mess });
  return error ? { ok: false as const, error: friendly(error.message) } : { ok: true as const };
}
