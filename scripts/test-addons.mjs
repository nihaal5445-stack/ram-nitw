// Add-on tokens end to end: mock purchase (SQL), signed ticket, offline scanner, sync, live stock. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";
import { signAddonTicket } from "../src/lib/access/addon-ticket.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const PIN = "482913";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };

const { data: slots } = await admin.from("mess_slots").select("*").eq("mess_id", "ifc-a");
const resetData = async () => {
  await admin.from("addon_purchases").delete().neq("id", NIL);
  await admin.from("scanner_devices").delete().neq("id", NIL);
  await admin.from("addons").update({ sold: 0, active: true }).neq("id", NIL);
};
const restoreSlots = async () => { for (const s of slots) await admin.from("mess_slots").update({ starts: s.starts, ends: s.ends }).eq("mess_id", "ifc-a").eq("slot", s.slot); };
await resetData();
let browser;
try {
  // widen only the lunch window to the whole day and park the others, so "now" is always inside exactly one slot
  for (const s of slots) await admin.from("mess_slots").update(s.slot === "lunch" ? { starts: "00:00", ends: "23:59" } : { starts: "03:00", ends: "03:01" }).eq("mess_id", "ifc-a").eq("slot", s.slot);
  const student = await as("student@student.nitw.ac.in");
  const counter = await as("counter@nitw.ac.in");
  const mAdmin = await as("admin@nitw.ac.in");
  const { data: list } = await student.from("addons").select("*");
  const paneer = list.find((a) => a.name === "Paneer Butter Masala");
  check("student sees only their mess's add-ons (ifc-a)", list.length > 0 && list.every((a) => a.mess_id === "ifc-a"), JSON.stringify(list.map((a) => a.mess_id)));

  // ── purchase rules ──
  // widen: the slot buy_addon picks must be "now" for the scanner. Find it by buying, then widen exactly that slot.
  const b1 = await student.rpc("buy_addon", { p_addon: paneer.id });
  check("student can buy (mock payment): TEST reference, a slot, stock reserved", !b1.error && /^TEST-/.test(b1.data.payment_ref), b1.error?.message);
  const slot = b1.data.slot, pid = b1.data.id;
  const { data: after } = await admin.from("addons").select("sold, stock_total").eq("id", paneer.id).single();
  check("stock decremented by the purchase", after.sold === 1, JSON.stringify(after));
  const b2 = await student.rpc("buy_addon", { p_addon: paneer.id });
  check("buying the same add-on twice for one slot is refused", !!b2.error && /already_bought/.test(b2.error.message), b2.error?.message);
  check("counter staff cannot buy", !!(await counter.rpc("buy_addon", { p_addon: paneer.id })).error);
  check("student cannot create add-ons", !!(await student.rpc("upsert_addon", { p_id: null, p_name: "Free lunch", p_price_paise: 0, p_stock: 5 })).error);
  check("student cannot write the table directly", !!(await student.from("addons").update({ price_paise: 1 }).eq("id", paneer.id)).error || (await admin.from("addons").select("price_paise").eq("id", paneer.id).single()).data.price_paise === 4000);
  const veg = await mAdmin.rpc("upsert_addon", { p_id: null, p_name: "Chicken Curry", p_price_paise: 5000, p_stock: 40 });
  check("IFC-A (pure veg) refuses a Chicken Curry add-on", !!veg.error && /pure vegetarian/.test(veg.error.message), veg.error?.message);
  const ok = await mAdmin.rpc("upsert_addon", { p_id: null, p_name: "Sweet Corn Soup", p_price_paise: 3000, p_stock: 1 });
  check("mess admin can define an add-on", !ok.error, ok.error?.message);
  const soup = ok.data;
  const bs = await student.rpc("buy_addon", { p_addon: soup });
  check("last unit sells", !bs.error, bs.error?.message);
  await admin.from("addon_purchases").delete().eq("id", bs.data?.id); // free the unique (student, addon, slot) but keep sold=1 -> sold out
  const so = await student.rpc("buy_addon", { p_addon: soup });
  check("sold-out add-on cannot be bought", !!so.error && /sold_out/.test(so.error.message), so.error?.message);
  check("redeem_addon is not callable by a signed-in user", !!(await counter.rpc("redeem_addon", { p_staff_id: NIL, p_scanner_id: NIL, p_purchase_id: pid, p_scanned_at: new Date().toISOString() })).error);
  await admin.from("addons").delete().eq("id", soup);

  // ── server key + ticket ──
  const pub = (await (await fetch(`${BASE}/api/addons/key`)).json()).public_key;
  check("public add-on key is served anonymously", typeof pub === "string" && pub.length > 80);
  const { data: keyRow } = await admin.from("addon_keys").select("private_jwk, public_key").single();
  check("the private key is NOT readable by a signed-in user", (await student.from("addon_keys").select("*")).data?.length === 0 || !!(await student.from("addon_keys").select("*")).error);
  const priv = await crypto.subtle.importKey("jwk", JSON.parse(keyRow.private_jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const date = b1.data.meal_date;
  const ticket = await signAddonTicket(priv, { i: pid, m: "ifc-a", d: date, s: slot, n: "Paneer Butter Masala", u: "Demo Student" });
  const wrongMess = await signAddonTicket(priv, { i: pid, m: "krishna", d: date, s: slot, n: "Paneer Butter Masala", u: "Demo Student" });
  const wrongSlot = await signAddonTicket(priv, { i: pid, m: "ifc-a", d: date, s: slot === "dinner" ? "breakfast" : "dinner", n: "Paneer Butter Masala", u: "Demo Student" });
  const forged = ticket.slice(0, -4) + "AAAA";

  browser = await chromium.launch();
  const c = await sessionCookies("counter@nitw.ac.in");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(c.cookies);
  const page = await ctx.newPage();
  const visible = (loc, ms = 10000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
  await page.goto(`${BASE}/dashboard/counter/scan?debug=1`, { waitUntil: "networkidle" });
  await page.getByLabel("Choose a shift PIN").fill(PIN);
  await page.getByLabel("Repeat the PIN").fill(PIN);
  await page.getByRole("button", { name: "Start shift" }).click();
  check("shift starts", await visible(page.getByText(/Shift data valid until/)));
  const paste = async (text) => { await page.getByTestId("debug-code").fill(text); await page.getByRole("button", { name: "Check" }).click(); await wait(700); };
  const result = () => page.getByTestId("scan-result");

  await ctx.setOffline(true);
  await paste(forged);
  check("OFFLINE: forged ticket refused", /Forged or damaged/.test(await result().innerText()), await result().innerText());
  await paste(wrongMess);
  check("OFFLINE: ticket for another mess refused (validly signed, wrong mess)", /another mess/.test(await result().innerText()), await result().innerText());
  await paste(wrongSlot);
  check("OFFLINE: ticket for another slot refused", /another meal slot/.test(await result().innerText()), await result().innerText());
  await paste(ticket);
  check("OFFLINE: valid add-on ticket accepted with item and student", (await result().getAttribute("data-tone")) === "ok" && /Paneer Butter Masala/.test(await result().innerText()) && /Demo Student/.test(await result().innerText()), await result().innerText());
  await wait(2800);
  await paste(ticket);
  check("OFFLINE: the same ticket twice is refused", /already used/i.test(await result().innerText()), await result().innerText());
  await page.screenshot({ path: "screenshots/addon-scan-1440-light.png" });

  await ctx.setOffline(false);
  await page.getByRole("button", { name: /Sync now/ }).click().catch(() => {});
  let status;
  for (let i = 0; i < 20; i++) { status = (await admin.from("addon_purchases").select("status, scanner_id").eq("id", pid).single()).data; if (status.status === "redeemed") break; await wait(1000); }
  check("after sync the purchase is 'redeemed' by the scanner", status.status === "redeemed" && !!status.scanner_id, JSON.stringify(status));

  // a second device replaying the same ticket is a duplicate at the server
  const sc = (await admin.from("scanner_devices").select("id").limit(1).single()).data.id;
  const { data: staff } = await admin.from("profiles").select("id").eq("email", "counter@nitw.ac.in").single();
  const rep = await admin.rpc("redeem_addon", { p_staff_id: staff.id, p_scanner_id: sc, p_purchase_id: pid, p_scanned_at: new Date().toISOString() });
  check("server: second redemption of the same ticket is a duplicate", rep.data?.status === "duplicate", JSON.stringify(rep));

  // ── admin page shows live stock and served ──
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await a.addCookies((await sessionCookies("admin@nitw.ac.in")).cookies);
  const ap = await a.newPage();
  await ap.goto(`${BASE}/dashboard/admin/addons`, { waitUntil: "networkidle" });
  const row = ap.getByTestId("addon-table").getByRole("row", { name: /Paneer Butter Masala/ });
  check("admin page: stock left 29 / 30, sold 1, served 1", /29 \/ 30\s+1\s+1/.test((await row.innerText()).replace(/\s+/g, " ")), await row.innerText());
  await ap.screenshot({ path: "screenshots/addon-admin-1440-light.png" });

  // (the student shop UI, cart, payment sheet and receipts are covered by test:extras)
  // payment_mode: with a real gateway configured, free direct purchases are refused
  await admin.from("app_settings").upsert({ key: "payment_mode", value: "razorpay" });
  await admin.from("addon_purchases").delete().neq("id", NIL); await admin.from("addons").update({ sold: 0 }).neq("id", NIL);
  const gated = await student.rpc("buy_addon", { p_addon: paneer.id });
  check("payment_mode=razorpay: direct buy_addon is refused (payment_required)", !!gated.error && /payment_required/.test(gated.error.message), gated.error?.message);
  const pre = await admin.rpc("addon_precheck", { p_student: "11111111-1111-1111-1111-111111111111", p_addon: paneer.id });
  check("service role precheck works without side effects", !pre.error && pre.data.amount_paise === 4000 && (await admin.from("addons").select("sold").eq("id", paneer.id).single()).data.sold === 0, pre.error?.message);
  const paid = await admin.rpc("record_paid_addon", { p_student: "11111111-1111-1111-1111-111111111111", p_addon: paneer.id, p_payment_id: "pay_TESTSIG1", p_order_id: "order_TESTSIG1" });
  check("record_paid_addon issues the purchase with the Razorpay ids", !paid.error && paid.data.payment_ref === "pay_TESTSIG1" && paid.data.method === "razorpay", paid.error?.message);
  check("a student cannot call record_paid_addon", !!(await student.rpc("record_paid_addon", { p_student: "11111111-1111-1111-1111-111111111111", p_addon: paneer.id, p_payment_id: "x", p_order_id: "y" })).error);
  await admin.from("app_settings").upsert({ key: "payment_mode", value: "mock" });
} finally {
  await browser?.close();
  await restoreSlots();
  await resetData();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL ADD-ON TESTS PASSED");
process.exit(failed ? 1 : 0);
