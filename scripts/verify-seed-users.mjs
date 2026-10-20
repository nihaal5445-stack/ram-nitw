import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const seedUsers = [
  { email: "student@student.nitw.ac.in", password: "password123", expectedRole: "student" },
  { email: "parent@example.com", password: "password123", expectedRole: "parent" },
  { email: "counter@nitw.ac.in", password: "password123", expectedRole: "counter_staff" },
  { email: "rep@student.nitw.ac.in", password: "password123", expectedRole: "mess_rep" },
  { email: "admin@nitw.ac.in", password: "password123", expectedRole: "mess_admin" },
  { email: "warden@nitw.ac.in", password: "password123", expectedRole: "warden" },
];

async function main() {
  console.log("=== 6-USER AUTH & PROFILE VERIFICATION CHECK ===\n");
  let allPassed = true;

  for (const user of seedUsers) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Sign in with password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    if (authError || !authData.user) {
      console.error(`❌ [FAILED] ${user.email}: Sign in failed ->`, authError?.message);
      allPassed = false;
      continue;
    }

    // 2. Read own profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, assigned_mess_id, linked_student_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error(`❌ [FAILED] ${user.email}: Profile fetch failed ->`, profileError?.message);
      allPassed = false;
      continue;
    }

    // 3. Verify role
    const roleMatch = profile.role === user.expectedRole;
    if (!roleMatch) {
      console.error(`❌ [FAILED] ${user.email}: Role mismatch. Expected: ${user.expectedRole}, Found: ${profile.role}`);
      allPassed = false;
      continue;
    }

    console.log(`✅ [PASSED] ${user.email}`);
    console.log(`   User ID: ${profile.id}`);
    console.log(`   Name:    ${profile.full_name}`);
    console.log(`   Role:    ${profile.role} (matches expected)`);
    if (profile.assigned_mess_id) console.log(`   Mess:    ${profile.assigned_mess_id}`);
    if (profile.linked_student_id) console.log(`   Linked:  ${profile.linked_student_id}`);
    console.log("");
  }

  if (allPassed) {
    console.log("🎉 ALL 6 SEED USERS SUCCESSFULLY SIGNED IN AND READ THEIR PROFILES WITH EXPECTED ROLES.");
  } else {
    console.error("❌ ONE OR MORE USER CHECKS FAILED.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
