// CPU cost of the animated dark backdrop: main-thread task time over 10 s on the idle public page (dark), animation on vs off.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3100";
const b = await chromium.launch();
for (const [label, reduce] of [["animated", "no-preference"], ["reduced-motion", "reduce"]]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: reduce });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "networkidle" });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  const get = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const a = await get(); await p.waitForTimeout(10000); const z = await get();
  const cpu = ((z.TaskDuration - a.TaskDuration) / (z.Timestamp - a.Timestamp)) * 100;
  const anim = await p.evaluate(() => document.getAnimations().length);
  console.log(`${label}: main-thread busy ${cpu.toFixed(2)}% (idle page, 10 s), running CSS animations: ${anim}`);
  await ctx.close();
}
await b.close();
