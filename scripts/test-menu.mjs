// Student dashboard menu: 4 meals, one highlighted, veg tags, hearts, "This week" tab. Needs supabase + `next start -p 3100`.
import { chromium } from "playwright";
import { sessionCookies } from "./lib/session.mjs";
import { istWeekday, menuFor } from "../src/config/weekly-menu.ts";

const BASE = process.env.BASE ?? "http://localhost:3100";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const b = await chromium.launch();
const open = async (email, w = 1280, h = 1000) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); await ctx.addCookies((await sessionCookies(email)).cookies); const p = await ctx.newPage(); await p.goto(`${BASE}/dashboard/student`, { waitUntil: "networkidle" }); await p.getByTestId("student-menu").waitFor({ timeout: 10000 }); return p; };

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
// visible near the top, expanded, every dish: student (IFC-A, veg only) and student2 (IFC-B), desktop and phone
const day = istWeekday(new Date());
for (const [email, label, vegOnly] of [["student@student.nitw.ac.in", "student (IFC-A)", true], ["student2@student.nitw.ac.in", "student2 (IFC-B)", false]]) {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const p = await open(email, w, h);
    const top = await p.getByTestId("student-menu").evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    check(`${label} @${w}: the menu starts in the first screen (top ${Math.round(top)}px < ${h})`, top < h, top);
    let allDishes = true, allVisible = true;
    for (const slot of ["breakfast", "lunch", "snacks", "dinner"]) {
      const card = p.getByTestId(`meal-${slot}`);
      const n = await card.locator("li").count();
      const expect = menuFor(slot, day).filter((d) => !vegOnly || d.veg).length;
      if (n !== expect) allDishes = false;
      if (!(await card.isVisible())) allVisible = false;
    }
    check(`${label} @${w}: all 4 meals visible by default (no click) with every dish`, allDishes && allVisible);
    if (w === 1280) {
      const bTop = await p.getByTestId("meal-breakfast").evaluate((e) => e.getBoundingClientRect().top);
      check(`${label} @${w}: the first meal row is on screen without scrolling`, bTop < h, bTop);
    }
    await p.screenshot({ path: `screenshots/menu-top-${label.slice(0, 8).replace(/\W/g, "")}-${w}.png` });
  }
}
await b.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL MENU TESTS PASSED");
process.exit(failed ? 1 : 0);
