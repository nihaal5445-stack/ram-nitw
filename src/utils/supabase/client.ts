import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_NAME, browserSupabaseUrl } from "./config";

export function createClient() {
  return createBrowserClient(browserSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
  });
}
