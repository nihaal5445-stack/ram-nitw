import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { hexToBytes, prepareScans, type IncomingScan } from "@/lib/access/verify-scans";
import { parseToken } from "@/lib/access/token";

export const runtime = "nodejs";
const MAX_SCANS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST { scannerId, scans: IncomingScan[] }  ->  { results: [{ id, status, reason }] }
 * Auth: browser session cookie, or `Authorization: Bearer <access token>` (tests, future native app).
 * Verifies ECDSA signatures here (Postgres cannot), then calls the service-role-only record_scans().
 */
export async function POST(request: Request) {
  const admin = createAdminClient();

  let userId: string | null = null;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    userId = (await admin.auth.getUser(bearer)).data.user?.id ?? null;
  } else {
    userId = (await (await createClient()).auth.getUser()).data.user?.id ?? null;
  }
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile || !["counter_staff", "mess_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { scannerId?: string; scans?: IncomingScan[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const { scannerId, scans } = body;
  if (!scannerId || !UUID.test(scannerId) || !Array.isArray(scans) || scans.length > MAX_SCANS) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (scans.some((s) => !s || !UUID.test(String(s.id)) || (s.method !== "qr" && s.method !== "manual") || Number.isNaN(Date.parse(s.scanned_at)))) {
    return NextResponse.json({ error: "bad_scan" }, { status: 400 });
  }

  const keys = [...new Set(scans.filter((s) => s.method === "qr" && s.token).map((s) => parseToken(s.token!)?.deviceKey).filter(Boolean) as string[])];
  const publicKeys = new Map<string, Uint8Array>();
  if (keys.length) {
    const { data } = await admin.from("student_devices").select("device_key, public_key").in("device_key", keys);
    for (const d of data ?? []) publicKeys.set(d.device_key, hexToBytes(d.public_key as unknown as string));
  }

  const prepared = await prepareScans(scans, publicKeys);
  const { data, error } = await admin.rpc("record_scans", { p_staff_id: userId, p_scanner_id: scannerId, p_scans: prepared });
  if (error) {
    const status = error.message.includes("not authorized") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ results: data });
}
