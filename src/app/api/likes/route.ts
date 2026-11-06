import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Public aggregate: today's like counts per dish for one mess. */
export async function GET(request: Request) {
  const mess = new URL(request.url).searchParams.get("mess") ?? "";
  if (!/^[a-z0-9-]{2,30}$/.test(mess)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("dish_like_counts", { p_mess: mess });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ counts: data }, { headers: { "cache-control": "public, max-age=5" } });
}
