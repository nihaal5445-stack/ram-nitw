// Usage: node scripts/shoot.mjs <name> [path] [selector]  (BASE env defaults to http://localhost:3000)
// Writes screenshots/<name>-{1440,390}-{light,dark}.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [name = "page", path = "/", selector] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    // scroll through so lazy images and scroll-driven reveals settle
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) console.warn(`HORIZONTAL SCROLL at ${w} ${scheme}`);
    const file = `screenshots/${name}-${w}-${scheme}.png`;
    if (selector) await page.locator(selector).first().screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: !!process.env.FULL });
    console.log(file);
    await ctx.close();
  }
}
await browser.close();
