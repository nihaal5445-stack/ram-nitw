// Builds the cookies @supabase/ssr would set after a password sign-in, so Playwright can start already signed in.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export function supabaseEnv() {
  return Object.fromEntries(execSync("npx supabase status -o env 2>/dev/null").toString().split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
}

export async function sessionCookies(email, password = "password123", domain = "localhost") {
  const env = supabaseEnv();
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  const name = `sb-${new URL(env.API_URL).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const CHUNK = 3180; // @supabase/ssr splits long values into name.0, name.1, ...
  const parts = value.length <= CHUNK ? [[name, value]] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)]);
  return { cookies: parts.map(([n, v]) => ({ name: n, value: v, domain, path: "/", httpOnly: false, secure: false, sameSite: "Lax" })), user: data.user, token: data.session.access_token };
}
