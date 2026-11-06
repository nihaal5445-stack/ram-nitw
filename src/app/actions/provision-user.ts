"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createAdminClient } from "@/utils/supabase/admin";
import { provisionUser } from "@/lib/provision-user";
import { authConfig, type Role } from "@/config/auth";

/** Warden-only: add a parent or staff account. (UI comes with the Phase 7 user-management screen.) */
export async function provisionUserAction(input: {
  email: string; role: Role; fullName?: string; assignedMessId?: string; linkedStudentId?: string;
}) {
  const { user, profile } = await getCurrentProfile();
  if (!user || profile?.role !== "warden") return { ok: false as const, error: "forbidden" };
  if (!authConfig.roles.includes(input.role)) return { ok: false as const, error: "invalid_role" };

  const { error } = await provisionUser(
    { actor: await createClient(), admin: createAdminClient() },
    { ...input, provisionedBy: user.id },
  );
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
