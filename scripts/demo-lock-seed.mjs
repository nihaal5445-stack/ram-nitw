// Before exposing the app through a public tunnel: give every seed account a random password, because the seed
// passwords ("password123") are public in the README. `npm run db:reset` restores them (the test scripts need that).
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./lib/session.mjs";

const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const RESTORE = process.argv.includes("--restore"); // put the public seed passwords back (the test scripts need them)
const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333",
  "44444444-4444-4444-4444-444444444444", "55555555-5555-5555-5555-555555555555", "66666666-6666-6666-6666-666666666666",
  "77777777-7777-7777-7777-777777777777", "88888888-8888-8888-8888-888888888888"];
for (const id of ids) {
  const { error } = await admin.auth.admin.updateUserById(id, { password: RESTORE ? "password123" : randomBytes(24).toString("base64url") });
  console.log(error ? `FAILED ${id}: ${error.message}` : `${RESTORE ? "seed password restored" : "random password set"} for ${id.slice(0, 8)}…`);
}
console.log("\nSeed passwords are now random. Sign in with the emailed 6-digit code. Run `npm run db:reset` afterwards to restore the dev data.");
