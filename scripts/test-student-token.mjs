// Browser test of /dashboard/student/token. Needs: supabase running, `next start -p 3100`.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";
import { parseToken, importPublicKey, verifyToken, stepAt } from "../src/lib/access/token.ts";
import { hexToBytes } from "../src/lib/access/verify-scans.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const S1 = "11111111-1111-1111-1111-111111111111";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failed++; };
mkdirSync("screenshots", { recursive: true });

const NIL = "00000000-0000-0000-0000-000000000000";
await admin.from("fraud_flags").delete().neq("id", NIL);
await admin.from("meal_redemptions").delete().neq("id", NIL);
await admin.from("student_devices").delete().eq("student_id", S1);
const { cookies } = await sessionCookies("student@student.nitw.ac.in");
const browser = await chromium.launch();
const newPhone = async (scheme = "light") => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  await ctx.addCookies(cookies);
  return { ctx, page: await ctx.newPage() };
};
const visible = (loc, ms = 8000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const token = (page) => page.locator("[data-testid=qr-token]").getAttribute("data-token");
async function publicKey() {
  const { data } = await admin.from("student_devices").select("device_key, public_key").eq("student_id", S1).is("revoked_at", null).single();
  return { deviceKey: data.device_key, key: await importPublicKey(hexToBytes(data.public_key)) };
}

// 1. enrol on "phone A"
const A = await newPhone();
await A.page.goto(`${BASE}/dashboard/student/token`, { waitUntil: "networkidle" });
check("not enrolled: shows the set-up screen", await visible(A.page.getByRole("button", { name: "Enroll this phone" })));
await A.page.screenshot({ path: "screenshots/token-enroll-390-light.png" });
await A.page.getByRole("button", { name: "Enroll this phone" }).click();
await A.page.waitForFunction(() => document.querySelector("[data-testid=qr-token]")?.getAttribute("data-token"), null, { timeout: 15000 });
const t1 = await token(A.page);
const { deviceKey, key } = await publicKey();
const p1 = parseToken(t1);
check("QR token has the documented shape", !!p1 && p1.deviceKey === deviceKey, t1);
check("QR token verifies against the public key stored in the database", (await verifyToken(key, p1, Date.now())).ok === true);
check("private key never reached the server (only a 65-byte public key)", (await admin.from("student_devices").select("public_key").eq("student_id", S1).is("revoked_at", null).single()).data.public_key.length === 2 + 130);
check("device is stored non-extractable in IndexedDB", await A.page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open("ram-access"); r.onsuccess = () => { const q = r.result.transaction("kv").objectStore("kv").get("device"); q.onsuccess = () => res(q.result.privateKey.extractable === false && q.result.privateKey instanceof CryptoKey); };
})));
check("countdown is shown", /\d+ s/.test(await A.page.getByRole("timer").innerText()));
await A.page.screenshot({ path: "screenshots/token-qr-390-light.png" });

// 2. rotation + offline
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await A.ctx.setOffline(true);
await wait((30 - (Date.now() / 1000) % 30) * 1000 + 1500);  // cross the next 30 s boundary while OFFLINE
const t2 = await token(A.page);
check("while offline the code still rotates at the 30 s boundary", t2 !== t1 && parseToken(t2).step > p1.step, `${p1.step} -> ${parseToken(t2)?.step}`);
check("...and the new code verifies", (await verifyToken(key, parseToken(t2), Date.now())).ok === true);
check("offline banner shown", await visible(A.page.getByText("You are offline. The QR still works.")));
await A.ctx.setOffline(false);

// 3. a second phone replaces the first
const B = await newPhone("dark");
await B.page.goto(`${BASE}/dashboard/student/token`, { waitUntil: "networkidle" });
check("phone B sees that another phone is active", await visible(B.page.getByText(/is your active device/)));
await B.page.getByRole("button", { name: "Use this phone instead" }).click();
await B.page.waitForFunction(() => document.querySelector("[data-testid=qr-token]")?.getAttribute("data-token"), null, { timeout: 15000 });
await B.page.screenshot({ path: "screenshots/token-qr-390-dark.png" });
const active = (await admin.from("student_devices").select("id").eq("student_id", S1).is("revoked_at", null)).data;
check("exactly one active device after enrolling phone B", active.length === 1);
await A.page.reload({ waitUntil: "networkidle" });
check("phone A now says it is no longer active", await visible(A.page.getByRole("heading", { name: "This phone is no longer active" })));
await A.page.screenshot({ path: "screenshots/token-replaced-390-light.png" });

// 4. revoke from phone B
await B.page.getByRole("button", { name: "Revoke" }).click();
await B.page.getByRole("button", { name: "Enroll this phone" }).waitFor({ timeout: 10000 });
check("revoking returns phone B to the set-up screen and leaves no active device", (await admin.from("student_devices").select("id").eq("student_id", S1).is("revoked_at", null)).data.length === 0);

// 5. dashboard shows the entry point and real (empty) history
await B.page.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
check("dashboard has the 'Show my meal QR' entry point", await visible(B.page.getByRole("link", { name: /Show my meal QR/ })));
await B.page.screenshot({ path: "screenshots/student-dashboard-390-dark.png", fullPage: true });
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL STUDENT TOKEN PAGE TESTS PASSED");
process.exit(failed ? 1 : 0);
