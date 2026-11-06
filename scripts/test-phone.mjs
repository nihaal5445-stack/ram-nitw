// Phone-as-scanner end to end THROUGH THE TUNNEL (run `npm run demo:phone` first; the seed passwords are locked, so sign-in uses the email code):
// phone viewport at the tunnel URL signs in as admin-ifcb, starts a shift, scans student2's QR; the laptop admin dashboard (localhost) must
// show the head count and the crowd update by themselves (Supabase Realtime), with no page reload.
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { supabaseEnv } from "./lib/session.mjs";
import { generateDeviceKeyPair, exportPublicKey, signToken } from "../src/lib/access/token.ts";
import { toB64u } from "../src/lib/access/base64url.ts";

const T = JSON.parse(readFileSync(new URL("../.demo-phone/state.json", import.meta.url), "utf8")).url;
const LAPTOP = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const PIN = "482913";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 220)}`); if (!ok) failed++; };
const vis = (l, ms = 15000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const priorDemo = (await admin.from("app_settings").select("value").eq("key", "demo_mode").single()).data?.value ?? "off";
await admin.from("app_settings").upsert({ key: "demo_mode", value: "on" });
await admin.from("meal_redemptions").delete().neq("id", NIL);
await admin.from("scanner_devices").delete().neq("id", NIL);
await admin.from("student_devices").delete().eq("student_id", "77777777-7777-7777-7777-777777777777");

async function codeFor(email) { const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw new Error(error.message); return data.properties.email_otp; }
async function signIn(page, base, email, tab) {
  await page.goto(`${base}/login?role=${tab}`, { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await page.getByLabel("Or enter the 6-digit code from the email").waitFor({ timeout: 20000 });
  await page.getByLabel("Or enter the 6-digit code from the email").fill(await codeFor(email));
  await page.getByRole("button", { name: "Sign in with code" }).click();
  await page.waitForURL(/\/dashboard\//, { timeout: 30000 });
}

let browser;
try {
  check("tunnel serves the app over HTTPS", T.startsWith("https://") && (await fetch(`${T}/api/time`)).ok);
  check("Supabase is reachable only through the app: /sb/auth/v1/health via the tunnel", (await fetch(`${T}/sb/auth/v1/health`, { headers: { apikey: env.ANON_KEY } })).ok);

  // student2 enrols a device (server side), builds a live QR
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await c.auth.verifyOtp({ email: "student2@student.nitw.ac.in", token: await codeFor("student2@student.nitw.ac.in"), type: "email" });
  const kp = await generateDeviceKeyPair();
  const enr = await c.rpc("enroll_device", { p_label: "phone-test", p_public_key_b64u: toB64u(await exportPublicKey(kp.publicKey)) });
  check("student2 enrolled a device", !enr.error, enr.error?.message);
  const deviceKey = enr.data[0].device_key;

  browser = await chromium.launch();
  // laptop admin dashboard (direct, localhost)
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const laptop = await lctx.newPage();
  let navs = 0; laptop.on("framenavigated", () => navs++);
  await signIn(laptop, LAPTOP, "admin-ifcb@nitw.ac.in", "staff");
  await laptop.goto(`${LAPTOP}/dashboard/admin`, { waitUntil: "networkidle" });
  const countEl = laptop.getByTestId("live-count");
  await countEl.waitFor({ timeout: 10000 });
  const n0 = Number(await countEl.getAttribute("data-count"));
  const crowdText0 = await laptop.getByTestId("crowd-panel").innerText();
  navs = 0;
  await wait(2500); // let the websocket subscribe

  // phone (tunnel URL, phone viewport)
  const pctx = await browser.newContext({ ...devices["iPhone 13"], permissions: ["camera"] });
  const phone = await pctx.newPage();
  await signIn(phone, T, "admin-ifcb@nitw.ac.in", "staff");
  check("phone signed in through the tunnel (email code, /sb proxy)", /\/dashboard\//.test(phone.url()), phone.url());
  await phone.goto(`${T}/dashboard/counter/scan?debug=1`, { waitUntil: "networkidle" });
  await phone.getByLabel("Choose a shift PIN").fill(PIN); await phone.getByLabel("Repeat the PIN").fill(PIN);
  await phone.getByRole("button", { name: "Start shift" }).click();
  check("phone starts a shift", await vis(phone.getByText(/Shift data valid until/)));

  // scan student2's QR
  const token = await signToken(kp.privateKey, deviceKey, Date.now());
  const tScan = Date.now();
  await phone.getByTestId("debug-code").fill(token);
  await phone.getByRole("button", { name: "Check" }).click();
  await phone.getByTestId("scan-result").waitFor({ timeout: 10000 });
  check("phone: big GREEN result with the student's name", (await phone.getByTestId("scan-result").getAttribute("data-tone")) === "ok" && /Demo Student Two/.test(await phone.getByTestId("scan-title").innerText()));

  // phone layout
  const box = async (loc) => (await loc.boundingBox());
  const res = await box(phone.getByTestId("scan-result")), cam = await box(phone.getByTestId("camera-box"));
  const fs = await phone.getByTestId("scan-title").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const bg = await phone.getByTestId("scan-result").evaluate((e) => getComputedStyle(e).backgroundColor);
  check("phone: the result sits ABOVE the camera view", res && cam && res.y < cam.y, JSON.stringify([res?.y, cam?.y]));
  check("phone: camera view fills the screen width and is tall", cam && cam.width >= 350 && cam.height >= 300, JSON.stringify(cam));
  check("phone: result title is large (>= 28 px) on a solid green block", fs >= 28 && bg === "rgb(29, 107, 58)", `${fs}px ${bg}`);
  await phone.screenshot({ path: "screenshots/phone-scan-ok-390.png" });

  // sync happens by itself right after the scan; laptop updates live
  let synced = null;
  for (let i = 0; i < 20; i++) { synced = (await admin.from("meal_redemptions").select("id").eq("status", "accepted")).data?.length; if (synced === 1) break; await wait(500); }
  const tSynced = Date.now() - tScan;
  check("scan synced to the server immediately (no manual sync, no 30 s wait)", synced === 1 && tSynced < 5000, `${synced} rows after ${tSynced} ms`);
  let n1 = n0;
  for (let i = 0; i < 40 && n1 === n0; i++) { await wait(250); n1 = Number(await countEl.getAttribute("data-count")); }
  check("laptop admin head count went up by 1 by itself (Realtime, no reload)", n1 === n0 + 1, `${n0} -> ${n1}`);
  check("...and the page did not navigate or reload", navs === 0, navs);
  await wait(1500);
  const crowdText1 = await laptop.getByTestId("crowd-panel").innerText();
  check("...and the live crowd panel changed too", crowdText1 !== crowdText0);
  await laptop.screenshot({ path: "screenshots/phone-laptop-admin-1440.png" });

  // a duplicate scan: red, big
  await wait(2800);
  await phone.getByTestId("debug-code").fill(await signToken(kp.privateKey, deviceKey, Date.now()));
  await phone.getByRole("button", { name: "Check" }).click();
  await wait(800);
  check("phone: second scan is a big RED 'already served'", (await phone.getByTestId("scan-result").getAttribute("data-tone")) === "bad" && /already served/i.test(await phone.getByTestId("scan-title").innerText()));
  await phone.screenshot({ path: "screenshots/phone-scan-dup-390.png" });
} finally {
  await browser?.close();
  await admin.from("app_settings").upsert({ key: "demo_mode", value: priorDemo });
  await admin.from("meal_redemptions").delete().neq("id", NIL);
  await admin.from("scanner_devices").delete().neq("id", NIL);
  await admin.from("student_devices").delete().eq("student_id", "77777777-7777-7777-7777-777777777777");
}
console.log(failed ? `\n${failed} FAILED` : "\nALL PHONE TESTS PASSED");
process.exit(failed ? 1 : 0);
