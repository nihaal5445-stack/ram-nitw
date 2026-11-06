import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/config/auth";

export interface ProvisionInput {
  email: string;
  role: Role;
  fullName?: string;
  assignedMessId?: string;
  linkedStudentId?: string;
  /** auth user id of the warden doing this */
  provisionedBy: string;
}

/**
 * Adds a parent/staff account. Two steps, because the DB trigger (migration
 * 20261106000000_restrict_signups) rejects any non-student email that is not on
 * the allow-list when the auth user is created:
 *   1. `actor` (the warden's own RLS-checked session) inserts the allow-list row;
 *   2. `admin` (service role) creates the auth user, which consumes the row.
 * If step 2 fails the allow-list row is removed again.
 */
export async function provisionUser(
  clients: { actor: SupabaseClient; admin: SupabaseClient },
  input: ProvisionInput,
) {
  const email = input.email.trim().toLowerCase();
  const { error: allowError } = await clients.actor.from("provisioned_accounts").insert({
    email,
    role: input.role,
    full_name: input.fullName ?? null,
    assigned_mess_id: input.assignedMessId ?? null,
    linked_student_id: input.linkedStudentId ?? null,
    provisioned_by: input.provisionedBy,
  });
  if (allowError) return { error: allowError };

  const { data, error } = await clients.admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: input.fullName ? { full_name: input.fullName } : undefined,
  });
  if (error) {
    await clients.actor.from("provisioned_accounts").delete().eq("email", email);
    return { error };
  }
  return { data, error: null };
}
