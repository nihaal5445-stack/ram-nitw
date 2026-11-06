import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature } from "./razorpay.ts";

const sign = (o: string, p: string, s: string) => createHmac("sha256", s).update(`${o}|${p}`).digest("hex");

test("accepts the signature Razorpay Checkout would send", () => {
  assert.equal(verifySignature("order_Abc123", "pay_Xyz789", sign("order_Abc123", "pay_Xyz789", "secret"), "secret"), true);
});
test("rejects a signature for another payment or order, another secret, or garbage", () => {
  const good = sign("order_Abc123", "pay_Xyz789", "secret");
  assert.equal(verifySignature("order_Abc123", "pay_OTHER", good, "secret"), false);
  assert.equal(verifySignature("order_OTHER", "pay_Xyz789", good, "secret"), false);
  assert.equal(verifySignature("order_Abc123", "pay_Xyz789", good, "other-secret"), false);
  assert.equal(verifySignature("order_Abc123", "pay_Xyz789", "deadbeef", "secret"), false);
  assert.equal(verifySignature("", "pay_Xyz789", good, "secret"), false);
  assert.equal(verifySignature("order_Abc123", "pay_Xyz789", good.slice(0, 63) + "0", "secret"), good.endsWith("0"));
});
