import { createClient } from "@supabase/supabase-js";

/** DEMO MODE flag, read from the database (set by `npm run demo:prep` from DEMO_MODE in .env.local). False on any error. */
export async function getDemoMode(): Promise<boolean> {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    return (await db.rpc("demo_mode")).data === true;
  } catch { return false; }
}
