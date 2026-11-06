/**
 * One explicit cookie name for the auth session, shared by browser, server and proxy clients.
 * Without it @supabase/ssr derives the name from the Supabase URL's host (`sb-127-auth-token`), which differs
 * between the laptop (http://127.0.0.1:54321) and a phone behind a tunnel (https://<tunnel>/sb) and would hide
 * the session from the server.
 */
export const AUTH_COOKIE_NAME = "sb-ram-auth-token";

/**
 * URL the BROWSER uses for Supabase. In the two-device demo (NEXT_PUBLIC_SUPABASE_PROXY=1) the phone cannot reach
 * 127.0.0.1, so its requests go to <this origin>/sb, which next.config.ts rewrites to the local Supabase.
 */
export function browserSupabaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_PROXY === "1" && typeof window !== "undefined") return `${window.location.origin}/sb`;
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}
