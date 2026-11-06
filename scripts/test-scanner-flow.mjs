// Browser end-to-end test of the offline scanner. Needs: supabase running, `next start -p 3100`.
// Phone (student) + laptop (counter) + a second laptop; scanner goes offline; fraud cases; sync.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";
import { generateDeviceKeyPair, exportPublicKey, signToken } from "../src/lib/access/token.ts";
import { toB64u } from "../src/lib/access/base64url.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NIL = "00000000-0000-0000-0000-000000000000";
const S1 = "11111111-1111-1111-1111-111111111111";
const PIN = "482913";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
mkdirSync("screenshots", { recursive: true });

// ── database prep: clean slate, and make ifc-a's lunch window cover the whole day for this test ──
const { data: origSlot } = await admin.from("mess_slots").select("*").eq("mess_id", "ifc-a").eq("slot", "lunch").single();
await admin.from("mess_slots").update({ starts: "00:00", ends: "23:59" }).eq("mess_id", "ifc-a").eq("slot", "lunch");
await admin.from("fraud_flags").delete().neq("id", NIL);
await admin.from("meal_redemptions").delete().neq("id", NIL);
await admin.from("scanner_devices").delete().neq("id", NIL);
await admin.from("student_devices").delete().eq("student_id", S1);
const stamp = Date.now();
const created = [];
async function newStudent(email, mess, roll) {
  const { data } = await admin.auth.admin.createUser({ email, password: "password123", email_confirm: true });
  await admin.from("profiles").update({ assigned_mess_id: mess, roll_number: roll, full_name: "Manual Student" }).eq("id", data.user.id);
  created.push(data.user.id); return data.user.id;
}
const rollManual = `MAN${String(stamp).slice(-6)}`;
await newStudent(`scan-manual-${stamp}@student.nitw.ac.in`, "ifc-a", rollManual);
await newStudent(`scan-other-${stamp}@student.nitw.ac.in`, "krishna", `OTH${String(stamp).slice(-6)}`);

let browser;
try {
  browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const student = await sessionCookies("student@student.nitw.ac.in");
  const counter = await sessionCookies("counter@nitw.ac.in");
  const open = async (cookies, viewport, scheme = "light") => {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, permissions: ["camera"] });
    await ctx.addCookies(cookies); return { ctx, page: await ctx.newPage() };
  };
  const visible = (loc, ms = 10000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

  // ── phone: enrol, read the live QR ──
  const phone = await open(student.cookies, { width: 390, height: 844 });
  await phone.page.goto(`${BASE}/dashboard/student/token`, { waitUntil: "networkidle" });
  await phone.page.getByRole("button", { name: "Enroll this phone" }).click();
  await phone.page.waitForFunction(() => document.querySelector("[data-testid=qr-token]")?.getAttribute("data-token"), null, { timeout: 15000 });
  const liveToken = () => phone.page.locator("[data-testid=qr-token]").getAttribute("data-token");
  const tOld = await liveToken(); const tOldAt = Date.now(); // the "screenshot"

  // ── laptop 1: start a shift ──
  const L1 = await open(counter.cookies, { width: 1440, height: 900 });
  await L1.page.goto(`${BASE}/dashboard/counter/scan?debug=1`, { waitUntil: "networkidle" });
  check("fresh laptop asks to start a shift", await visible(L1.page.getByRole("heading", { name: "Start a shift" })));
  await L1.page.getByLabel("Choose a shift PIN").fill(PIN);
  await L1.page.getByLabel("Repeat the PIN").fill("000000");
  await L1.page.getByRole("button", { name: "Start shift" }).click();
  check("mismatching PINs are refused", await visible(L1.page.getByText("The two PINs do not match.")));
  await L1.page.getByLabel("Repeat the PIN").fill(PIN);
  await L1.page.getByRole("button", { name: "Start shift" }).click();
  check("shift starts and shows the validity window", await visible(L1.page.getByText(/Shift data valid until/)));
  check("camera starts (fake device), no 'unavailable' message", await (async () => { await wait(2500); return !(await L1.page.getByText(/Camera unavailable/).isVisible()); })());

  // the roster is stored encrypted: plaintext names must not be in IndexedDB
  const stored = await L1.page.evaluate(() => new Promise((res) => { const r = indexedDB.open("ram-access"); r.onsuccess = () => { const q = r.result.transaction("kv").objectStore("kv").get("bundle"); q.onsuccess = () => res(JSON.stringify(q.result)); }; }));
  check("cached roster at rest is ciphertext (no student names or keys visible)", !stored.includes("Demo Student") && !stored.includes("public_key") && stored.includes('"ct"'));

  const paste = async (page, text) => { await page.getByTestId("debug-code").fill(text); await page.getByRole("button", { name: "Check" }).click(); await wait(700); };
  const result = (page) => page.getByTestId("scan-result");
  const tone = (page) => result(page).getAttribute("data-tone");

  // ── go OFFLINE, then scan ──
  await L1.ctx.setOffline(true);
  check("offline chip shown", await visible(L1.page.getByText("Offline: still scanning")));
  const t1 = await liveToken();
  await paste(L1.page, t1);
  check("OFFLINE: valid QR admits the student", (await tone(L1.page)) === "ok" && /Demo Student/.test(await result(L1.page).innerText()), await result(L1.page).innerText());
  check("...and is queued (1 waiting to sync)", await visible(L1.page.getByText("1 waiting to sync")));
  await L1.page.screenshot({ path: "screenshots/scanner-ok-1440-light.png" });

  await wait(2800);
  await paste(L1.page, t1);
  check("OFFLINE: second scan in the same slot is refused (already served)", (await tone(L1.page)) === "bad" && /already served/i.test(await result(L1.page).innerText()), await result(L1.page).innerText());

  const tampered = (await liveToken()).slice(0, -4) + "AAAA";
  await paste(L1.page, tampered);
  check("OFFLINE: tampered signature -> Invalid code", /Invalid code/.test(await result(L1.page).innerText()), await result(L1.page).innerText());

  await paste(L1.page, "hello world");
  check("OFFLINE: non-RAM text -> not a RAM meal code", /Not a RAM meal code/.test(await result(L1.page).innerText()));

  // an other-mess student (valid key pair, enrolled on the server, but NOT in this mess's bundle)
  const otherEmail = `scan-other-${stamp}@student.nitw.ac.in`;
  const { createClient: mk } = await import("@supabase/supabase-js");
  const os = mk(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await os.auth.signInWithPassword({ email: otherEmail, password: "password123" });
  const kp = await generateDeviceKeyPair();
  const { data: enr } = await os.rpc("enroll_device", { p_label: "krishna phone", p_public_key_b64u: toB64u(await exportPublicKey(kp.publicKey)) });
  await paste(L1.page, await signToken(kp.privateKey, enr[0].device_key, Date.now()));
  check("OFFLINE: student of another mess -> not registered for this mess", /Not registered for this mess/.test(await result(L1.page).innerText()), await result(L1.page).innerText());

  // manual entry
  await L1.page.getByRole("button", { name: "Manual entry" }).click();
  await L1.page.getByLabel("Roll number").fill(rollManual);
  check("manual entry needs a reason before it can be submitted", await L1.page.getByRole("button", { name: "Admit" }).isDisabled());
  await L1.page.getByLabel("Reason").selectOption("phone_dead");
  await L1.page.getByLabel("Your shift PIN").fill("111111");
  await L1.page.getByRole("button", { name: "Admit" }).click();
  check("manual entry with the wrong PIN is refused", await visible(L1.page.getByText("Wrong PIN.")));
  await L1.page.getByLabel("Your shift PIN").fill(PIN);
  await L1.page.getByRole("button", { name: "Admit" }).click();
  await wait(800);
  check("manual entry with reason + PIN admits the student", (await tone(L1.page)) === "ok" && /manual/.test(await result(L1.page).innerText()), await result(L1.page).innerText());

  // lock / unlock
  await L1.page.getByRole("button", { name: "Lock" }).click();
  check("lock screen appears and the roster is no longer on screen", await visible(L1.page.getByRole("heading", { name: "Scanner locked" })));
  await L1.page.getByLabel("Shift PIN").fill("999999");
  await L1.page.getByRole("button", { name: "Unlock" }).click();
  check("wrong unlock PIN shows tries left", await visible(L1.page.getByText(/9 tries left/)));
  await L1.page.getByLabel("Shift PIN").fill(PIN);
  await L1.page.getByRole("button", { name: "Unlock" }).click();
  check("correct PIN unlocks again (offline)", await visible(L1.page.getByText(/Shift data valid until/)));

  // ── a second laptop, also offline, admits the same student: the cross-scanner fraud case ──
  const L2 = await open(counter.cookies, { width: 390, height: 844 }, "dark");
  await L2.page.goto(`${BASE}/dashboard/counter/scan?debug=1`, { waitUntil: "networkidle" });
  await L2.page.getByLabel("Choose a shift PIN").fill(PIN); await L2.page.getByLabel("Repeat the PIN").fill(PIN);
  await L2.page.getByRole("button", { name: "Start shift" }).click();
  await visible(L2.page.getByText(/Shift data valid until/));
  await L2.ctx.setOffline(true);
  await paste(L2.page, await liveToken());
  check("second laptop, offline, also admits the student (it cannot know)", (await tone(L2.page)) === "ok", await result(L2.page).innerText());
  await L2.page.screenshot({ path: "screenshots/scanner-ok-390-dark.png" });

  // ── screenshot attack: the code captured at the start, now > 60 s old ──
  const age = Date.now() - tOldAt;
  if (age < 66_000) await wait(66_000 - age);
  await paste(L1.page, tOld);
  check("OFFLINE: a screenshot older than 60 s is refused (expired)", /Code expired/.test(await result(L1.page).innerText()), `${await result(L1.page).innerText()} (age ${Math.round((Date.now() - tOldAt) / 1000)}s)`);

  // ── back ONLINE: outbox syncs by itself ──
  await L1.ctx.setOffline(false);
  const drained = await L1.page.waitForFunction(() => /\b0 waiting to sync/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true, () => false);
  check("laptop 1 back online: outbox drains on its own", drained);
  await wait(500);
  const rows1 = (await admin.from("meal_redemptions").select("status, method, student_id, reject_reason, scanner_id")).data;
  check("server has exactly one accepted QR admission for the student", rows1.filter((r) => r.status === "accepted" && r.method === "qr" && r.student_id === S1).length === 1, JSON.stringify(rows1));
  check("server recorded the manual admission with its reason", (await admin.from("meal_redemptions").select("manual_reason, staff_id").eq("method", "manual").eq("status", "accepted")).data.some((r) => r.manual_reason === "phone_dead"));

  await L2.ctx.setOffline(false);
  await L2.page.waitForFunction(() => /\b0 waiting to sync/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  const alertShown = await visible(L2.page.getByText(/Already admitted elsewhere/), 15000);
  check("laptop 2 is told its admission was a duplicate (cross-scanner)", alertShown);
  const flags = (await admin.from("fraud_flags").select("kind")).data.map((f) => f.kind);
  for (const k of ["duplicate_cross_scanner", "duplicate_same_scanner", "bad_signature", "stale_code", "wrong_mess"]) check(`fraud flag recorded: ${k}`, flags.includes(k), flags.join(","));
  const accepted = (await admin.from("meal_redemptions").select("student_id, slot, meal_date").eq("status", "accepted")).data;
  check("still exactly one accepted row per (student, slot, date) after both laptops synced", new Set(accepted.map((a) => a.student_id + a.slot + a.meal_date)).size === accepted.length);
  await L1.page.screenshot({ path: "screenshots/scanner-synced-1440-light.png" });
} finally {
  await browser?.close();
  await admin.from("mess_slots").update({ starts: origSlot.starts, ends: origSlot.ends }).eq("mess_id", "ifc-a").eq("slot", "lunch"); // restore
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
}
console.log(failed ? `\n${failed} FAILED` : "\nALL SCANNER FLOW TESTS PASSED");
process.exit(failed ? 1 : 0);
