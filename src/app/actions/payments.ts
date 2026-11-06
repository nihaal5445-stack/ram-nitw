"use server";

import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createAdminClient } from "@/utils/supabase/admin";
import { createOrder, razorpayConfigured, verifySignature } from "@/lib/payments/razorpay";
import { cartError, toItems, type CartLine, type CartResult } from "@/lib/addons/cart";


/** Keeps the database in step with the environment: with Razorpay keys, direct (unpaid) buy_addon calls are refused. */
export async function syncPaymentMode(): Promise<"razorpay" | "mock"> {
  const mode = razorpayConfigured() ? "razorpay" : "mock";
  try { await createAdminClient().from("app_settings").upsert({ key: "payment_mode", value: mode }); } catch { /* keep going */ }
  return mode;
}

/** Step 1 (Razorpay test mode): check the cart can be bought, then create the order server-side with OUR total. */
export async function startRazorpayCart(lines: CartLine[]) {
  const { user } = await getCurrentProfile();
  if (!user || !razorpayConfigured()) return { ok: false as const, error: "Online payment is not set up." };
  await syncPaymentMode();
  const admin = createAdminClient();
  const items = toItems(lines);
  const pre = await admin.rpc("cart_precheck", { p_student: user.id, p_items: items });
  if (pre.error) return { ok: false as const, error: cartError(pre.error.message) };
  const { amount_paise, count } = pre.data as { amount_paise: number; count: number };
  const order = await createOrder(amount_paise, `ram_${Date.now()}`);
  if (!order) return { ok: false as const, error: "Could not start the payment. Try again." };
  await admin.from("addon_orders").insert({ order_id: order.id, student_id: user.id, amount_paise, items });
  return { ok: true as const, orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID!, amountPaise: amount_paise, name: `${count} item${count === 1 ? "" : "s"}` };
}

/** Step 2: verify the Razorpay signature, then (and only then) issue the order and its tickets. */
export async function confirmRazorpayCart(input: { orderId: string; paymentId: string; signature: string }) {
  const { user } = await getCurrentProfile();
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!user || !secret) return { ok: false as const, error: "Please sign in again." };
  const admin = createAdminClient();
  const { data: order } = await admin.from("addon_orders").select("order_id, student_id, items, status").eq("order_id", input.orderId).maybeSingle();
  if (!order || order.student_id !== user.id || order.status !== "created") return { ok: false as const, error: "Unknown or already used order." };
  if (!verifySignature(input.orderId, input.paymentId, input.signature, secret)) return { ok: false as const, error: "Payment could not be verified." };
  const { data, error } = await admin.rpc("record_paid_cart", { p_student: user.id, p_items: order.items, p_payment_id: input.paymentId, p_order_id: input.orderId });
  if (error) return { ok: false as const, error: cartError(error.message) + " Your payment was verified: contact the mess admin for a refund." };
  await admin.from("addon_orders").update({ status: "paid" }).eq("order_id", input.orderId);
  return { ok: true as const, result: data as CartResult };
}
