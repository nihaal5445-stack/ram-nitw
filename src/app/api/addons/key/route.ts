import { NextResponse } from "next/server";
import { addonKeys } from "@/lib/addons/server-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public key scanners use to verify add-on tickets offline. */
export async function GET() {
  const { publicKey } = await addonKeys();
  return NextResponse.json({ public_key: publicKey });
}
