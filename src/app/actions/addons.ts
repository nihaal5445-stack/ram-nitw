"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { addonKeys } from "@/lib/addons/server-key";
import { signAddonTicket } from "@/lib/access/addon-ticket";
import { istParts } from "@/lib/access/slots";
import { cartError, toItems, type CartLine, type CartResult } from "@/lib/addons/cart";

/** MOCK payment (no Razorpay keys): no money moves. The SQL function reserves stock and issues one ticket per unit. */
export async function checkoutCart(lines: CartLine[], method: "upi" | "card" | "wallet" | "test" = "test") {
  const { user } = await getCurrentProfile();
  if (!user) return { ok: false as const, error: "Please sign in again." };
  const { data, error } = await (await createClient()).rpc("buy_cart", { p_items: toItems(lines), p_method: method });
  if (error) return { ok: false as const, error: cartError(error.message) };
  return { ok: true as const, result: data as CartResult };
}

/** Signed QR for each unit the caller owns (RLS), only unused ones for today. */
export async function getAddonTickets(ids: string[]) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return { ok: false as const, error: "Please sign in again." };
  const { data } = await (await createClient()).from("addon_purchases").select("id, mess_id, meal_date, slot, status, addons(name)").in("id", ids.slice(0, 20));
  const { privateKey } = await addonKeys();
  const out: Record<string, string> = {};
  for (const p of data ?? []) {
    if (p.status !== "paid" || p.meal_date !== istParts(Date.now()).date) continue;
    out[p.id] = await signAddonTicket(privateKey, { i: p.id, m: p.mess_id, d: p.meal_date, s: p.slot, n: (p.addons as unknown as { name: string } | null)?.name ?? "Extra", u: (profile.full_name ?? "Student").slice(0, 40) });
  }
  return { ok: true as const, tickets: out };
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
export async function saveAddon(input: { id?: string; name: string; priceRupees: number; stock: number; active: boolean; veg?: boolean; photo?: string | null }) {
  const { user, profile } = await getCurrentProfile();
  if (!user || profile?.role !== "mess_admin") return { ok: false as const, error: "Only a mess admin can do this." };
  if (!Number.isFinite(input.priceRupees) || input.priceRupees < 0 || input.priceRupees > 1000 || !Number.isInteger(input.stock) || input.stock < 0) {
    return { ok: false as const, error: "Check the price and stock." };
  }
  const { error } = await (await createClient()).rpc("upsert_addon", {
    p_id: input.id ?? null, p_name: input.name, p_price_paise: Math.round(input.priceRupees * 100), p_stock: input.stock, p_active: input.active, p_veg: input.veg ?? true, p_photo: input.photo ?? null,
  });
  if (error) return { ok: false as const, error: error.message.includes("pure vegetarian") ? "IFC-A is pure vegetarian: non-veg add-ons are not allowed." : error.message.includes("check") ? "Stock cannot be below the number already sold." : "Could not save." };
  return { ok: true as const };
}
