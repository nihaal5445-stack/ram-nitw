// Student dashboard menu: 4 meals, one highlighted, veg tags, hearts, "This week" tab. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { sessionCookies } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const b = await chromium.launch();
const open = async (email, w = 1280) => { const ctx = await b.newContext({ viewport: { width: w, height: 1000 } }); await ctx.addCookies((await sessionCookies(email)).cookies); const p = await ctx.newPage(); await p.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" }); await p.getByTestId("student-menu").waitFor({ timeout: 10000 }); return p; };

const a = await open("student@student.nitw.ac.in");
check("all 4 meals are shown", (await a.locator("[data-testid^=meal-]").count()) === 4);
const marked = await a.locator("[data-testid^=meal-][data-status=now], [data-testid^=meal-][data-status=next]").count();
check("exactly one meal is highlighted as now serving / next up", marked === 1, marked);
check("each meal shows its time and veg tags", (await a.getByTestId("meal-lunch").innerText()).includes("12:00") && (await a.getByText("Veg", { exact: true }).count()) > 5);
check("IFC-A (pure veg): no Non-veg tag anywhere", (await a.getByText("Non-veg", { exact: true }).count()) === 0);
check("hearts: a heart per dish plus one per meal", (await a.getByTestId("like-btn").count()) > 4 * 3);
await a.screenshot({ path: "screenshots/menu-today-1280-light.png", fullPage: true });
await a.getByTestId("menu-tab-week").click();
check("'This week' tab: 7 day rows x 4 meals", (await a.getByTestId("week-menu").locator("tbody tr").count()) === 7 && (await a.getByTestId("week-menu").locator("thead th").count()) === 5);
check("today's row is marked", (await a.locator("tr[data-today=true]").count()) === 1);
check("the menu says it is demo data", (await a.getByText(/Demo menu/).count()) > 0);
await a.screenshot({ path: "screenshots/menu-week-1280-light.png", fullPage: true });

const c = await open("student2@student.nitw.ac.in", 390);
check("IFC-B student: non-veg items are tagged Non-veg", (await c.getByText("Non-veg", { exact: true }).count()) > 0);
await c.screenshot({ path: "screenshots/menu-today-390-light.png", fullPage: true });
await b.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL MENU TESTS PASSED");
process.exit(failed ? 1 : 0);
