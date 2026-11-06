"use server";

import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createAdminClient } from "@/utils/supabase/admin";
import { createOrder, razorpayConfigured, verifySignature } from "@/lib/payments/razorpay";
import type { Purchase } from "@/app/actions/addons";

const MSG: Record<string, string> = {
  sold_out: "Sold out.", no_slot_left_today: "No meal slot left today.", already_bought_for_this_slot: "You already bought this for the current slot.",
  "add-on not available": "This add-on is not available in your mess.",
};
const friendly = (m: string) => Object.entries(MSG).find(([k]) => m.includes(k))?.[1] ?? "Could not complete the purchase.";

/** Keeps the database in step with the environment: with Razorpay keys, direct (unpaid) buy_addon calls are refused. */
export async function syncPaymentMode(): Promise<"razorpay" | "mock"> {
  const mode = razorpayConfigured() ? "razorpay" : "mock";
  try { await createAdminClient().from("app_settings").upsert({ key: "payment_mode", value: mode }); } catch { /* keep going */ }
  return mode;
}

/** Step 1 (Razorpay test mode): check the purchase is possible, then create the order server-side with OUR price. */
export async function startRazorpay(addonId: string) {
  const { user } = await getCurrentProfile();
  if (!user || !razorpayConfigured()) return { ok: false as const, error: "Online payment is not set up." };
  await syncPaymentMode();
  const admin = createAdminClient();
  const pre = await admin.rpc("addon_precheck", { p_student: user.id, p_addon: addonId });
  if (pre.error) return { ok: false as const, error: friendly(pre.error.message) };
  const { amount_paise, name } = pre.data as { amount_paise: number; name: string };
  const order = await createOrder(amount_paise, `ram_${addonId.slice(0, 8)}_${Date.now()}`);
  if (!order) return { ok: false as const, error: "Could not start the payment. Try again." };
  await admin.from("addon_orders").insert({ order_id: order.id, student_id: user.id, addon_id: addonId, amount_paise });
  return { ok: true as const, orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID!, amountPaise: amount_paise, name };
}

/** Step 2: verify the Razorpay signature, then (and only then) issue the purchase/ticket. */
export async function confirmRazorpay(input: { orderId: string; paymentId: string; signature: string }) {
  const { user } = await getCurrentProfile();
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!user || !secret) return { ok: false as const, error: "Please sign in again." };
  const admin = createAdminClient();
  const { data: order } = await admin.from("addon_orders").select("order_id, student_id, addon_id, status").eq("order_id", input.orderId).maybeSingle();
  if (!order || order.student_id !== user.id || order.status !== "created") return { ok: false as const, error: "Unknown or already used order." };
  if (!verifySignature(input.orderId, input.paymentId, input.signature, secret)) return { ok: false as const, error: "Payment could not be verified." };
  const { data, error } = await admin.rpc("record_paid_addon", { p_student: user.id, p_addon: order.addon_id, p_payment_id: input.paymentId, p_order_id: input.orderId });
  if (error) return { ok: false as const, error: friendly(error.message) + " Your payment was verified: contact the mess admin for a refund." };
  await admin.from("addon_orders").update({ status: "paid" }).eq("order_id", input.orderId);
  return { ok: true as const, purchase: data as Purchase };
}
