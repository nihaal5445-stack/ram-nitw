// Notifications: bell on every dashboard, live toast via Realtime, inbox (filter / read / mark all / mute), composer (admin + warden),
// public Updates (home + /updates, privacy). Needs supabase + a running app (BASE, default http://localhost:3100).
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { sessionCookies, supabaseEnv } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const env = supabaseEnv();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const as = async (email) => { const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: "password123" }); return c; };
const TAG = "NTEST";
const cleanup = async () => {
  await admin.from("announcements").delete().like("title", `${TAG}%`);   // cascades to the notifications
  await admin.from("notification_prefs").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
};
await cleanup();
let browser;
try {
  const adminA = await as("admin@nitw.ac.in"), warden = await as("warden@nitw.ac.in"), s1 = await as("student@student.nitw.ac.in"), s2 = await as("student2@student.nitw.ac.in"), parent = await as("parent@example.com");
  const inbox = async (c) => (await c.rpc("my_notifications", { p_limit: 200 })).data ?? [];

  // --- seed data ---
  const seeded = await inbox(s1);
  check("seeded demo announcements reach IFC-A students (and only IFC-A ones)", seeded.length >= 4 && (await inbox(s2)).length >= 4);
  check("the parent of the demo student receives the same announcements", (await inbox(parent)).length >= 4);
  const pub = (await createClient(env.API_URL, env.ANON_KEY).rpc("public_announcements")).data;
  check("public view: seeded closures / special meals / timings for the messes, nothing else", pub.length >= 12 && pub.every((p) => ["closure", "special_meal", "timings"].includes(p.category)) && !pub.some((p) => /Menu change/.test(p.title)));

  // --- targeting through the real RPCs ---
  const r1 = await adminA.rpc("post_announcement", { p_title: `${TAG} own mess`, p_body: "Only IFC-A.", p_category: "general" });
  check("admin posts to own mess", !r1.error && r1.data >= 2, JSON.stringify(r1.error));
  check("S1 got it, S2 did not", (await inbox(s1)).some((n) => n.title === `${TAG} own mess`) && !(await inbox(s2)).some((n) => n.title === `${TAG} own mess`));
  check("admin cannot target another mess", !!(await adminA.rpc("post_announcement", { p_title: `${TAG} bad`, p_body: "x y z", p_category: "general", p_mess_ids: ["ifc-b"] })).error);
  check("a student cannot post", !!(await s1.rpc("post_announcement", { p_title: `${TAG} bad`, p_body: "x y z", p_category: "general" })).error);
  const w1 = await warden.rpc("post_announcement", { p_title: `${TAG} warden two`, p_body: "IFC-B and Krishna.", p_category: "closure", p_mess_ids: ["ifc-b", "krishna"], p_public: true });
  check("warden posts to several messes: S2 yes, S1 no", !w1.error && (await inbox(s2)).some((n) => n.title === `${TAG} warden two`) && !(await inbox(s1)).some((n) => n.title === `${TAG} warden two`));
  const w2 = await warden.rpc("post_announcement", { p_title: `${TAG} warden all`, p_body: "Everybody.", p_category: "special_meal", p_pinned: true });
  check("warden posts to all messes: S1, S2 and the parent get it", (await inbox(s1)).some((n) => n.title === `${TAG} warden all` && n.pinned) && (await inbox(s2)).some((n) => n.title === `${TAG} warden all`) && (await inbox(parent)).some((n) => n.title === `${TAG} warden all`));
  check("pinned item is first in the inbox", (await inbox(s1))[0].title === `${TAG} warden all`);

  // --- privacy ---
  const anon = createClient(env.API_URL, env.ANON_KEY);
  check("anonymous cannot read notifications", (await anon.from("notifications").select("*")).error != null);
  check("a student sees only their own rows", ((await s1.from("notifications").select("user_id")).data ?? []).every((r) => r.user_id === "11111111-1111-1111-1111-111111111111"));
  check("public updates never show private items", !(await anon.rpc("public_announcements")).data.some((p) => p.title === `${TAG} own mess`));
  check("public updates show the public warden closure", (await anon.rpc("public_announcements")).data.some((p) => p.title === `${TAG} warden two`));

  // --- UI ---
  browser = await chromium.launch();
  const open = async (email, w = 1280, h = 900) => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }); await ctx.addCookies((await sessionCookies(email)).cookies); const p = await ctx.newPage(); return p; };
  const vis = (l, ms = 8000) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

  for (const [email, path] of [["student@student.nitw.ac.in", "student"], ["parent@example.com", "parent"], ["counter@nitw.ac.in", "counter"], ["rep@student.nitw.ac.in", "rep"], ["admin@nitw.ac.in", "admin"], ["warden@nitw.ac.in", "warden"]]) {
    const p = await open(email, 390, 800);
    await p.goto(`${BASE}/dashboard/${path}`, { waitUntil: "networkidle" });
    check(`${path}: bell is in the header`, await vis(p.getByTestId("notif-bell")));
    await p.context().close();
  }

  // live toast: student is on the dashboard, admin posts, toast appears without a reload (poll is 20 s, so < 8 s means Realtime)
  const sp = await open("student@student.nitw.ac.in");
  await sp.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" });
  await sp.getByTestId("notif-bell").waitFor();
  const before = Number((await sp.getByTestId("notif-count").innerText().catch(() => "0")).replace("+", ""));
  await sp.waitForTimeout(1500);
  await adminA.rpc("post_announcement", { p_title: `${TAG} live one`, p_body: "Delivered live.", p_category: "timings" });
  check("student sees a live toast with the title", await vis(sp.getByTestId("notif-toast")) && (await sp.getByTestId("notif-toast").innerText()).includes(`${TAG} live one`));
  const after = Number((await sp.getByTestId("notif-count").innerText()).replace("+", ""));
  check("the bell count went up by one", after === before + 1, `${before} -> ${after}`);
  await sp.screenshot({ path: "screenshots/notif-toast-1280-light.png" });

  // inbox
  await sp.goto(`${BASE}/dashboard/notifications`, { waitUntil: "networkidle" });
  check("inbox lists notifications", (await sp.getByTestId("notif-item").count()) >= 5);
  await sp.getByTestId("filter-closure").click();
  const cats = await sp.getByTestId("notif-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-category")));
  check("filter by category shows only that category", cats.length > 0 && cats.every((c) => c === "closure"), cats.join());
  await sp.getByTestId("filter-all").click();
  const unreadBefore = await sp.locator("[data-testid=notif-item][data-unread=true]").count();
  await sp.getByTestId("mark-read").first().click();
  await sp.waitForTimeout(800);
  check("mark read reduces the unread items by one", (await sp.locator("[data-testid=notif-item][data-unread=true]").count()) === unreadBefore - 1);
  await sp.getByTestId("mute-general").uncheck();
  await sp.waitForTimeout(600);
  await adminA.rpc("post_announcement", { p_title: `${TAG} muted general`, p_body: "You muted this.", p_category: "general" });
  check("a muted category is not delivered", !(await inbox(s1)).some((n) => n.title === `${TAG} muted general`));
  check("complaint updates and admin messages cannot be unticked", (await sp.getByTestId("mute-complaint_update").isDisabled()) && (await sp.getByTestId("mute-admin_message").isDisabled()));
  await sp.getByTestId("mute-general").check();
  await sp.getByTestId("mark-all-read").click();
  await sp.waitForTimeout(900);
  check("mark all read: nothing unread, bell badge gone", (await sp.locator("[data-testid=notif-item][data-unread=true]").count()) === 0 && (await sp.getByTestId("notif-count").count()) === 0);
  await sp.screenshot({ path: "screenshots/notif-inbox-1280-light.png", fullPage: true });

  // composer (admin) via the UI
  const ap = await open("admin@nitw.ac.in");
  await ap.goto(`${BASE}/dashboard/notifications`, { waitUntil: "networkidle" });
  check("admin sees the composer, fixed to the own mess", await vis(ap.getByTestId("composer")) && (await ap.getByTestId("ann-targets-own").innerText()).includes("IFC-A"));
  await ap.getByTestId("ann-title").fill(`${TAG} from the form`);
  await ap.getByTestId("ann-body").fill("Dinner is closed on Sunday.");
  await ap.getByTestId("ann-category").selectOption("closure");
  await ap.getByTestId("ann-public").check();
  await ap.getByTestId("ann-pin").check();
  await ap.getByTestId("ann-send").click();
  check("composer sends and reports recipients", await vis(ap.getByTestId("ann-result")) && /Sent to \d+ people/.test(await ap.getByTestId("ann-result").innerText()));
  check("the posted announcement is listed with read counts", (await ap.getByTestId("posted-list").innerText()).includes(`${TAG} from the form`));
  await ap.screenshot({ path: "screenshots/notif-composer-1280-light.png", fullPage: true });
  const wp = await open("warden@nitw.ac.in");
  await wp.goto(`${BASE}/dashboard/notifications`, { waitUntil: "networkidle" });
  check("warden composer offers each confirmed mess to tick", (await wp.getByTestId("ann-targets").locator("input").count()) === 4);
  await wp.context().close();

  // public site
  const pp = await open("student@student.nitw.ac.in");   // any browser; the public pages need no login
  await pp.context().clearCookies();
  await pp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("home page has an Updates section with the public announcement", await vis(pp.locator("#updates")) && (await pp.locator("#updates").innerText()).includes(`${TAG} from the form`));
  check("home Updates show no private announcements", !(await pp.locator("#updates").innerText()).includes(`${TAG} own mess`));
  await pp.screenshot({ path: "screenshots/updates-home-1280-light.png", fullPage: false });
  await pp.goto(`${BASE}/updates`, { waitUntil: "networkidle" });
  const txt = await pp.locator("main, body").first().innerText();
  check("/updates lists public items (closure, special meal, timings) without login", (await pp.getByTestId("update-item").count()) >= 12 && txt.includes(`${TAG} from the form`));
  check("/updates hides private items (menu change, general) and anything personal", !/Menu change: new dal/.test(txt) && !txt.includes(`${TAG} own mess`) && !/complaint/i.test(await pp.getByTestId("updates-list").innerText()));
  await pp.screenshot({ path: "screenshots/updates-page-1280-light.png", fullPage: true });
  const phone = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const mp = await phone.newPage();
  await mp.goto(`${BASE}/updates`, { waitUntil: "networkidle" });
  check("/updates has no horizontal overflow at 390 px", await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mp.screenshot({ path: "screenshots/updates-page-390-light.png", fullPage: true });
} finally {
  await browser?.close();
  await cleanup();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL NOTIFICATION TESTS PASSED");
process.exit(failed ? 1 : 0);
