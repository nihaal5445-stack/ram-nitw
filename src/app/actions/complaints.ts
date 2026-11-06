"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { CATEGORIES } from "@/lib/complaints/group";

const MSG: Record<string, string> = {
  rate_limited: "You can file at most 5 complaints a day.",
  date_out_of_range: "Choose a meal from the last 3 days.",
  reply_required: "Write a reply of at least 10 characters.",
  reason_required: "A reason of at least 10 characters is required to decline.",
  already_answered: "This complaint was already answered.",
};
const friendly = (m: string, fallback: string) => Object.entries(MSG).find(([k]) => m.includes(k))?.[1] ?? fallback;

export async function fileComplaint(input: { mess: string; category: string; date: string; slot: string; body: string; anonymous: boolean }) {
  const { user } = await getCurrentProfile();
  if (!user) return { ok: false as const, error: "Please sign in again." };
  if (!(CATEGORIES as readonly string[]).includes(input.category)) return { ok: false as const, error: "Choose a category." };
  if (input.body.trim().length < 10) return { ok: false as const, error: "Please describe the problem in at least 10 characters." };
  const { error } = await (await createClient()).rpc("file_complaint", {
    p_mess: input.mess, p_category: input.category, p_date: input.date, p_slot: input.slot, p_body: input.body, p_anonymous: input.anonymous,
  });
  return error ? { ok: false as const, error: friendly(error.message, "Could not file the complaint.") } : { ok: true as const };
}

export async function respondComplaint(input: { id: string; outcome: "resolved" | "cannot_resolve"; reply: string; reason?: string }) {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "mess_admin") return { ok: false as const, error: "Only the mess admin can do this." };
  const { error } = await (await createClient()).rpc("respond_complaint", { p_id: input.id, p_outcome: input.outcome, p_reply: input.reply, p_reason: input.reason ?? null });
  return error ? { ok: false as const, error: friendly(error.message, "Could not send the reply.") } : { ok: true as const };
}

export async function postProgress(input: { id: string; text: string }) {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "mess_admin") return { ok: false as const, error: "Only the mess admin can do this." };
  const { error } = await (await createClient()).rpc("post_complaint_progress", { p_id: input.id, p_text: input.text });
  return error ? { ok: false as const, error: "Could not post (write at least 10 characters; only resolved items can be posted)." } : { ok: true as const };
}
