/** Cart helpers shared by the shop UI and the server actions (kept out of "use server" files: those may only export async functions). */
export interface Ticket { id: string; name: string; n: number; of: number }
/** A paid cart: one order, one single-use ticket per unit. */
export interface CartResult { id: string; order_id: string; payment_ref: string; method: string; amount_paise: number; created_at: string; slot: string; meal_date: string; count: number; name: string; tickets: Ticket[] }
export interface CartLine { addonId: string; qty: number }

export const MAX_PER_ITEM = 5;
export const MAX_ITEMS = 10;
export const toItems = (lines: CartLine[]) => lines.map((l) => ({ addon_id: l.addonId, qty: l.qty }));
export const cartError = (m: string) =>
  m.includes("sold_out") ? "Not enough stock for something in your cart: " + (m.split("sold_out:")[1]?.trim() ?? "") :
  m.includes("no_slot_left_today") ? "No meal slot left today." :
  m.includes("add-on not available") ? "An item in your cart is not available in your mess." :
  m.includes("too_many_items") ? `At most ${MAX_ITEMS} items per order.` :
  m.includes("bad_quantity") ? `Quantity must be 1 to ${MAX_PER_ITEM} per item.` :
  m.includes("empty_cart") ? "Your cart is empty." :
  m.includes("payment_required") ? "Online payment is required: use Razorpay checkout." : "Could not complete the purchase.";

/** Photo keys the admin can pick (files in /public/images; illustrative Unsplash photos, see /credits). */
export const EXTRA_PHOTOS = ["biryani", "pav-bhaji", "grab-go", "fresh-produce", "wellness-bowl"] as const;
