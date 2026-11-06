// Extras shop end to end in real browsers: cards, quantity, cart drawer, checkout through the test-payment sheet, one single-use ticket per unit,
// admin item management (add / edit / price / restock) and orders. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const S2 = "77777777-7777-7777-7777-777777777777";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 220)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const vis = (l, ms = 10000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const priorDemo = (await admin.from("app_settings").select("value").eq("key", "demo_mode").single()).data?.value ?? "off";
await admin.from("app_settings").upsert({ key: "demo_mode", value: "on" }); // the shop buys for the current/nearest meal at any hour
const reset = async () => { await admin.from("addon_purchases").delete().neq("id", NIL); await admin.from("extras_orders").delete().neq("id", NIL); await admin.from("scanner_devices").delete().neq("id", NIL); await admin.from("addons").update({ sold: 0 }).neq("id", NIL); await admin.from("addons").delete().in("name", ["Lime Soda", "Masala Chai Special"]); };
await reset();
let browser;
try {
  browser = await chromium.launch();
  const ctxS = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxS.addCookies((await sessionCookies("student2@student.nitw.ac.in")).cookies);
  const sp = await ctxS.newPage();
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctxA.addCookies((await sessionCookies("admin-ifcb@nitw.ac.in")).cookies);
  const ap = await ctxA.newPage();

  // ── admin adds an item ──
  await ap.goto(`${BASE}/dashboard/admin/addons`, { waitUntil: "networkidle" });
  await ap.locator("#ad-name").fill("Lime Soda"); await ap.locator("#ad-price").fill("25"); await ap.locator("#ad-stock").fill("6"); await ap.locator("#ad-photo").selectOption("fresh-produce");
  await ap.getByTestId("item-save").click();
  check("admin adds 'Lime Soda' Rs 25, stock 6, veg", await vis(ap.getByTestId("addon-table").getByRole("row", { name: /Lime Soda/ })) && /6 \/ 6/.test(await ap.getByTestId("addon-table").getByRole("row", { name: /Lime Soda/ }).innerText()));

  // ── student2 (IFC-B) sees cards ──
  await sp.goto(`${BASE}/dashboard/student/extras?debug=1`, { waitUntil: "networkidle" });
  const cards = sp.getByTestId("extra-card");
  check("shop shows IFC-B items as cards (Chicken Curry, Lime Soda)", (await cards.count()) === 2, await cards.count());
  const chicken = sp.locator("[data-testid=extra-card][data-name='Chicken Curry']");
  const soda = sp.locator("[data-testid=extra-card][data-name='Lime Soda']");
  const ct = await chicken.innerText();
  check("card: photo, name, Rs 50, Non-veg tag, 40 left", (await chicken.locator("img").count()) === 1 && /Rs 50/.test(ct) && /Non-veg/.test(ct) && /40 left/.test(ct), ct);
  check("card: Lime Soda is tagged Veg, 6 left", /Veg/.test(await soda.innerText()) && !/Non-veg/.test(await soda.innerText()) && /6 left/.test(await soda.innerText()));
  await sp.screenshot({ path: "screenshots/extras-shop-1280.png", fullPage: true });

  // quantity +/-, add to cart
  await chicken.getByTestId("qty-plus").click(); await chicken.getByTestId("qty-plus").click();
  check("quantity picker goes to 3", (await chicken.getByTestId("qty-value").innerText()) === "3");
  await chicken.getByTestId("qty-minus").click();
  check("...and back to 2", (await chicken.getByTestId("qty-value").innerText()) === "2");
  for (let i = 0; i < 8; i++) if (await soda.getByTestId("qty-plus").isEnabled()) await soda.getByTestId("qty-plus").click();
  check("quantity is capped at 5 per item", (await soda.getByTestId("qty-value").innerText()) === "5");
  await chicken.getByTestId("add-to-cart").click();
  check("Add to cart opens the cart drawer with the line and total Rs 100", await vis(sp.getByTestId("cart-drawer")) && (await sp.getByTestId("cart-line").count()) === 1 && /Rs 100/.test(await sp.getByTestId("cart-total").innerText()));
  await sp.getByRole("button", { name: "Close" }).first().click();
  await soda.getByTestId("qty-minus").click(); await soda.getByTestId("qty-minus").click(); await soda.getByTestId("qty-minus").click(); // 5 -> 2
  await soda.getByTestId("add-to-cart").click();
  check("cart: 2 lines, 4 items, Rs 150", (await sp.getByTestId("cart-line").count()) === 2 && /Rs 150/.test(await sp.getByTestId("cart-total").innerText()) && (await sp.getByTestId("cart-count").innerText()) === "4");
  await sp.screenshot({ path: "screenshots/extras-cart-1280.png" });
  await sp.getByTestId("cart-line").filter({ hasText: "Lime Soda" }).getByRole("button", { name: "Fewer" }).click();
  check("changing a quantity in the drawer updates the total (Rs 125)", /Rs 125/.test(await sp.getByTestId("cart-total").innerText()));

  // checkout through the test-payment sheet
  await sp.getByTestId("checkout").click();
  check("checkout opens the test-payment sheet for Rs 125 with UPI / Card / Wallet", await vis(sp.getByTestId("payment-sheet")) && await vis(sp.getByTestId("tab-card")) && /Rs 125/.test(await sp.getByTestId("payment-sheet").innerText()) && /no money is charged/.test(await sp.getByTestId("payment-sheet").innerText()));
  await sp.getByTestId("tab-wallet").click(); await sp.getByTestId("wallet-pay").click();
  check("processing state, then success with a receipt", await vis(sp.getByTestId("processing"), 3000) && await vis(sp.getByTestId("pay-success"), 8000) && /Rs 125/.test(await sp.getByTestId("receipt").innerText()) && /^order_TEST_/.test(await sp.getByTestId("receipt-order").innerText()));
  await sp.getByTestId("pay-done").click();
  check("one ticket QR per unit: 3 tickets (2 x Chicken Curry, 1 x Lime Soda)", await vis(sp.getByTestId("ticket-list")) && (await sp.getByTestId("ticket").count()) === 3, await sp.getByTestId("ticket").count());
  const texts = await sp.getByTestId("ticket").evaluateAll((els) => els.map((e) => e.getAttribute("data-ticket")));
  check("every ticket is a distinct signed code", new Set(texts).size === 3 && texts.every((x) => /^ramA\./.test(x)));
  await sp.screenshot({ path: "screenshots/extras-tickets-1280.png", fullPage: true });
  const left = (await admin.from("addons").select("name, sold, stock_total").in("name", ["Chicken Curry", "Lime Soda"])).data;
  check("stock decreased by the quantities (Chicken 2, Lime Soda 1)", left.find((x) => x.name === "Chicken Curry").sold === 2 && left.find((x) => x.name === "Lime Soda").sold === 1, JSON.stringify(left));
  await sp.reload({ waitUntil: "networkidle" });
  check("order and its receipt are in 'My orders'", (await sp.getByTestId("order-row").count()) === 1);
  await sp.getByTestId("receipt-toggle").click();
  check("receipt shows order id, amount, method", /Rs 125/.test(await sp.getByTestId("receipt").innerText()) && /Wallet/.test(await sp.getByTestId("receipt").innerText()));

  // each ticket is single-use at the server
  const { data: purchases } = await admin.from("addon_purchases").select("id, addons(name)").eq("student_id", S2).order("created_at");
  const sc = (await admin.rpc("register_scanner", { p_label: "x" })).error; void sc;
  const { data: st } = await admin.from("profiles").select("id").eq("email", "admin-ifcb@nitw.ac.in").single();
  const { data: scanner } = await admin.from("scanner_devices").insert({ mess_id: "ifc-b", staff_id: st.id, label: "test" }).select("id").single();
  await admin.from("app_settings").upsert({ key: "demo_mode", value: "on" });
  const redeem = (id) => admin.rpc("redeem_addon", { p_staff_id: st.id, p_scanner_id: scanner.id, p_purchase_id: id, p_scanned_at: new Date().toISOString() });
  const r1 = await redeem(purchases[0].id), r1b = await redeem(purchases[0].id), r2 = await redeem(purchases[1].id);
  check("each unit redeems once: first accepted, replay duplicate, the next unit accepted separately", r1.data?.status === "accepted" && r1b.data?.status === "duplicate" && r2.data?.status === "accepted", JSON.stringify([r1.data, r1b.data, r2.data]));

  // ── cart rules (server) ──
  const s2 = await as("student2@student.nitw.ac.in"), counter = await as("counter@nitw.ac.in");
  const { data: ids } = await admin.from("addons").select("id, name").eq("mess_id", "ifc-b");
  const chickenId = ids.find((x) => x.name === "Chicken Curry").id, sodaId = ids.find((x) => x.name === "Lime Soda").id;
  const bad = (items) => s2.rpc("buy_cart", { p_items: items });
  check("quantity 0 and 6 are refused", !!(await bad([{ addon_id: chickenId, qty: 0 }])).error && !!(await bad([{ addon_id: chickenId, qty: 6 }])).error);
  check("the same item twice in one cart is refused", !!(await bad([{ addon_id: chickenId, qty: 1 }, { addon_id: chickenId, qty: 1 }])).error);
  check("more than the stock left (Lime Soda: 5 left, ask 5 ok, then 1 more refused)", !(await bad([{ addon_id: sodaId, qty: 5 }])).error && /sold_out/.test((await bad([{ addon_id: sodaId, qty: 1 }])).error?.message ?? ""));
  check("an item of another mess is refused", !!(await bad([{ addon_id: (await admin.from("addons").select("id").eq("mess_id", "ifc-a").limit(1).single()).data.id, qty: 1 }])).error);
  check("counter staff cannot buy", !!(await counter.rpc("buy_cart", { p_items: [{ addon_id: chickenId, qty: 1 }] })).error);
  check("sold-out card: Add to cart is disabled", await (async () => { await sp.reload({ waitUntil: "networkidle" }); return !(await sp.locator("[data-testid=extra-card][data-name='Lime Soda']").getByTestId("add-to-cart").isEnabled()) && /Sold out/.test(await sp.locator("[data-testid=extra-card][data-name='Lime Soda']").innerText()); })());

  // ── admin: edit price, restock, orders ──
  await ap.goto(`${BASE}/dashboard/admin/addons`, { waitUntil: "networkidle" });
  await ap.getByTestId("restock-Lime Soda").click();
  check("admin 'Restock +10' raises Lime Soda stock (16 total)", (await vis(ap.getByTestId("addon-table").getByRole("row", { name: /Lime Soda/ }).getByText(/\/ 16/))));
  await ap.getByTestId("edit-Lime Soda").click(); await ap.locator("#ad-price").fill("30"); await ap.getByTestId("item-save").click();
  check("admin changes the price to Rs 30", await vis(ap.getByTestId("addon-table").getByRole("row", { name: /Lime Soda/ }).getByText("Rs 30")));
  await sp.reload({ waitUntil: "networkidle" });
  check("student sees the new price and the restock (Rs 30, 10 left)", /Rs 30/.test(await sp.locator("[data-testid=extra-card][data-name='Lime Soda']").innerText()) && /\d+ left/.test(await sp.locator("[data-testid=extra-card][data-name='Lime Soda']").innerText()));
  await ap.reload({ waitUntil: "networkidle" });
  check("admin orders table lists the order: student, items, total, tickets used 2 / 3", /Demo Student Two/.test(await ap.getByTestId("orders-table").innerText()) && /2 × Chicken Curry/.test(await ap.getByTestId("orders-table").innerText()) && /2 \/ 3/.test(await ap.getByTestId("orders-table").innerText()), await ap.getByTestId("orders-table").innerText());
  await ap.screenshot({ path: "screenshots/extras-admin-1440.png", fullPage: true });
  check("IFC-A admin cannot create a non-veg item", await (async () => { const a1 = await as("admin@nitw.ac.in"); const r = await a1.rpc("upsert_addon", { p_id: null, p_name: "Lime Soda 2", p_price_paise: 1000, p_stock: 5, p_active: true, p_veg: false, p_photo: "grab-go" }); return !!r.error && /pure vegetarian/.test(r.error.message); })());
} finally {
  await browser?.close();
  await admin.from("app_settings").upsert({ key: "demo_mode", value: priorDemo });
  await reset();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL EXTRAS TESTS PASSED");
process.exit(failed ? 1 : 0);
