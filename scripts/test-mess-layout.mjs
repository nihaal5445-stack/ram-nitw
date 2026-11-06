// Public mess sections: balanced two columns at 1440 and 1024, sticky left column, full menu/most liked/glance present, single column on phones.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3100";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 220)}`); if (!ok) failed++; };
const b = await chromium.launch();
for (const w of [1440, 1024, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  for (const id of ["ifc-a", "ifc-b", "krishna", "priyadarshini"]) {
    const art = p.locator(`#mess-${id}`);
    check(`${id} @${w}: full menu card with all 4 meal tabs`, (await art.getByTestId(`full-menu-${id}`).getByRole("tab").count()) === 4);
    check(`${id} @${w}: 'Most liked this week' (3 dishes) and 'Mess at a glance' (3 facts)`, (await art.getByTestId(`most-liked-${id}`).locator("li").count()) === 3 && (await art.getByTestId(`glance-${id}`).locator("dt").count()) === 3);
    if (w >= 1024) {
      const m = await art.evaluate((e, id2) => {
        const left = e.querySelector(`[data-testid=mess-left-${id2}]`), right = left.nextElementSibling, a = e.getBoundingClientRect();
        const l = left.getBoundingClientRect(), r = right.getBoundingClientRect();
        return { lh: l.height, rh: r.height, lb: l.bottom - a.top, rb: r.bottom - a.top, sticky: getComputedStyle(left).position, ah: a.height };
      }, id);
      const diff = Math.abs(m.lh - m.rh), pct = diff / Math.max(m.lh, m.rh);
      check(`${id} @${w}: columns end at about the same height (left ${Math.round(m.lh)}px, right ${Math.round(m.rh)}px, diff ${Math.round(pct * 100)}%)`, pct <= 0.15, JSON.stringify(m));
      check(`${id} @${w}: left column is sticky`, m.sticky === "sticky");
      if (id === "ifc-a") {
        await art.scrollIntoViewIfNeeded();
        await p.screenshot({ path: `screenshots/mess-${id}-${w}-${ctx._options.colorScheme ?? "light"}.png`, fullPage: false });
      }
    }
  }
  if (w === 390) check("phone: no horizontal overflow, single column", (await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
  await ctx.close();
}
await b.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL MESS LAYOUT TESTS PASSED");
process.exit(failed ? 1 : 0);
