"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { addonKeys } from "@/lib/addons/server-key";
import { signAddonTicket } from "@/lib/access/addon-ticket";
import { istParts } from "@/lib/access/slots";

const FRIENDLY: Record<string, string> = {
  sold_out: "Sold out.",
  no_slot_left_today: "No meal slot left today.",
  already_bought_for_this_slot: "You already bought this for the current slot.",
  "add-on not available": "This add-on is not available in your mess.",
  payment_required: "Online payment is required.",
};
const friendly = (m: string) => Object.entries(FRIENDLY).find(([k]) => m.includes(k))?.[1] ?? "Could not complete the purchase.";

/** MOCK payment: no money moves. The SQL function reserves stock and records a TEST transaction. */
export interface Purchase { id: string; slot: string; meal_date: string; payment_ref: string; order_id: string; method: string; amount_paise: number; created_at: string; name: string }

export async function buyAddon(addonId: string, method: "upi" | "card" | "wallet" | "test" = "test") {
  const { user } = await getCurrentProfile();
  if (!user) return { ok: false as const, error: "Please sign in again." };
  const { data, error } = await (await createClient()).rpc("buy_addon", { p_addon: addonId, p_method: method });
  if (error) return { ok: false as const, error: error.message.includes("payment_required") ? "Online payment is required: use Razorpay checkout." : friendly(error.message) };
  return { ok: true as const, purchase: data as Purchase };
}

/** The signed one-slot QR for a purchase the caller owns (RLS), only while it is unused and for today. */
export async function getAddonTicket(purchaseId: string) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return { ok: false as const, error: "Please sign in again." };
  const { data: p } = await (await createClient())
    .from("addon_purchases").select("id, mess_id, meal_date, slot, status, addons(name)").eq("id", purchaseId).maybeSingle();
  if (!p) return { ok: false as const, error: "Not found." };
  if (p.status !== "paid") return { ok: false as const, error: "Already used." };
  if (p.meal_date !== istParts(Date.now()).date) return { ok: false as const, error: "This ticket was for another day." };
  const addon = p.addons as unknown as { name: string } | null;
  const { privateKey } = await addonKeys();
  const ticket = await signAddonTicket(privateKey, {
    i: p.id, m: p.mess_id, d: p.meal_date, s: p.slot, n: addon?.name ?? "Add-on", u: (profile.full_name ?? "Student").slice(0, 40),
  });
  return { ok: true as const, ticket };
}

/** Mess admin: create or edit an add-on in their own mess. */
export async function saveAddon(input: { id?: string; name: string; priceRupees: number; stock: number; active: boolean }) {
  const { user, profile } = await getCurrentProfile();
  if (!user || profile?.role !== "mess_admin") return { ok: false as const, error: "Only a mess admin can do this." };
  if (!Number.isFinite(input.priceRupees) || input.priceRupees < 0 || input.priceRupees > 1000 || !Number.isInteger(input.stock) || input.stock < 0) {
    return { ok: false as const, error: "Check the price and stock." };
  }
  const { error } = await (await createClient()).rpc("upsert_addon", {
    p_id: input.id ?? null, p_name: input.name, p_price_paise: Math.round(input.priceRupees * 100), p_stock: input.stock, p_active: input.active,
  });
  if (error) return { ok: false as const, error: error.message.includes("pure vegetarian") ? "IFC-A is pure vegetarian: non-veg add-ons are not allowed." : error.message.includes("check") ? "Stock cannot be below the number already sold." : "Could not save." };
  return { ok: true as const };
}
