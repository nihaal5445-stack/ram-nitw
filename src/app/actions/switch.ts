"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { addonKeys } from "@/lib/addons/server-key";
import { signAddonTicket } from "@/lib/access/addon-ticket";
import { istParts } from "@/lib/access/slots";
import { messes } from "@/config/messes";

const KNOWN = ["already_issued", "already_ate", "not_less_crowded", "not_eligible", "no_open_slot", "switching_off"];

export async function issueSwitchPass(toMess: string) {
  const { user } = await getCurrentProfile();
  if (!user) return { ok: false as const, error: "default" };
  const { data, error } = await (await createClient()).rpc("issue_switch_pass", { p_to_mess: toMess });
  if (error) return { ok: false as const, error: KNOWN.find((k) => error.message.includes(k)) ?? "default" };
  return { ok: true as const, passId: (data as { id: string }).id };
}

/** Signed pass QR for a pass the caller owns (RLS), while unused and for today. Scanner at the destination mess verifies it offline. */
export async function getSwitchTicket(passId: string) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return { ok: false as const, error: "default" };
  const { data: p } = await (await createClient()).from("mess_switch_passes").select("id, from_mess, to_mess, meal_date, slot, status").eq("id", passId).maybeSingle();
  if (!p || p.status !== "issued" || p.meal_date !== istParts(Date.now()).date) return { ok: false as const, error: "default" };
  const from = messes.find((m) => m.id === p.from_mess)?.name ?? p.from_mess;
  const { privateKey } = await addonKeys();
  const ticket = await signAddonTicket(privateKey, { i: p.id, m: p.to_mess, d: p.meal_date, s: p.slot, n: from, u: (profile.full_name ?? "Student").slice(0, 40), k: "pass" });
  return { ok: true as const, ticket, toMess: p.to_mess };
}
