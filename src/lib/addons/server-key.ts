import { createAdminClient } from "@/utils/supabase/admin";
import { toB64u } from "@/lib/access/base64url";

/** Server-only: the add-on signing key pair, created on first use and kept in public.addon_keys (service role only). */
let cached: { privateKey: CryptoKey; publicKey: string } | null = null;

async function load() {
  const admin = createAdminClient();
  const { data } = await admin.from("addon_keys").select("public_key, private_jwk").eq("id", 1).maybeSingle();
  return data;
}

export async function addonKeys() {
  if (cached) return cached;
  let row = await load();
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = toB64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
    await createAdminClient().from("addon_keys").upsert({ id: 1, public_key: pub, private_jwk: jwk }, { onConflict: "id", ignoreDuplicates: true });
    row = await load(); // if two requests raced, everyone reads the winner
  }
  const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(row!.private_jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  cached = { privateKey, publicKey: row!.public_key };
  return cached;
}
