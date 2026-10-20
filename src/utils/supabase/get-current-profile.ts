import { createClient } from "@/utils/supabase/server";
import type { Role } from "@/config/auth";
import type { User } from "@supabase/supabase-js";

export interface CurrentProfile {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  assigned_mess_id: string | null;
  linked_student_id: string | null;
  preferred_locale: string;
  preferred_theme: string;
}

// Canonical mapping of all 6 roles to their specific sub-dashboard paths
export const roleDashboard: Record<Role, string> = {
  student: "/dashboard/student",
  parent: "/dashboard/parent",
  counter_staff: "/dashboard/counter",
  mess_rep: "/dashboard/rep",
  mess_admin: "/dashboard/admin",
  warden: "/dashboard/warden",
};

export async function getCurrentProfile(): Promise<{
  user: User | null;
  profile: CurrentProfile | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    if (authError) {
      console.error("[getCurrentProfile] Auth error:", authError.message);
    }
    return {
      user: null,
      profile: null,
      error: authError?.message ?? "Not authenticated",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role, full_name, assigned_mess_id, linked_student_id, preferred_locale, preferred_theme")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error(
      `[getCurrentProfile] Failed to fetch profile for user ${user.id} (${user.email}):`,
      profileError?.message ?? "No profile row returned"
    );
    return {
      user,
      profile: null,
      error: profileError?.message ?? "Profile not found",
    };
  }

  return { user, profile: profile as CurrentProfile };
}
