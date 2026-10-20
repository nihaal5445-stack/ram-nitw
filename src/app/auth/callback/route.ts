import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile, roleDashboard } from "@/utils/supabase/get-current-profile";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[auth/callback] exchangeCodeForSession failed:", exchangeError.message);
      return NextResponse.redirect(`${origin}/login?error=auth_exchange_failed`);
    }

    // Get the user profile using the shared helper
    const { user, profile, error: profileError } = await getCurrentProfile();

    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=no_user_session`);
    }

    if (!profile) {
      console.error("[auth/callback] No profile found for authenticated user:", profileError);
      return NextResponse.redirect(`${origin}/login?error=profile_not_found`);
    }

    const destination = roleDashboard[profile.role];
    return NextResponse.redirect(`${origin}${destination}`);
  }

  // On error or missing code, redirect back to login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
