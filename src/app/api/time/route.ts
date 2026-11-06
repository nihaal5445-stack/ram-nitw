import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Server clock, used by the student phone to detect a wrong device clock. Public and cache-free. */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
