import { createHmac, timingSafeEqual } from "node:crypto";

/** Razorpay (TEST MODE) helpers. Server only. Configured when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in .env.local. */
export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Checkout success signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex. Constant-time compare. */
export function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!orderId || !paymentId || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Creates an order with the amount decided by OUR server (never by the browser). UNTESTED against the live API (no keys in this repo). */
export async function createOrder(amountPaise: number, receipt: string): Promise<{ id: string } | null> {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string };
  } catch { return null; }
}
