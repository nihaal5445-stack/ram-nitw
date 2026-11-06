// Shared helpers for DEMO_MODE (see supabase migration 20261108040000_demo_mode.sql).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./session.mjs";

export function readEnvLocal() {
  try {
    return Object.fromEntries(readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(?:#.*)?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  } catch { return {}; }
}

/** DEMO_MODE from the process env, else .env.local; on = on/1/true/yes. Default off when unset. */
export const demoModeFromEnv = () => /^(on|1|true|yes)$/i.test(process.env.DEMO_MODE ?? readEnvLocal().DEMO_MODE ?? "off");

export async function setDemoMode(on) {
  const env = supabaseEnv();
  const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from("app_settings").upsert({ key: "demo_mode", value: on ? "on" : "off" });
  if (error) throw new Error(error.message);
  return on;
}
