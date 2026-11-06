// BASE=http://localhost:3100 node scripts/shoot-dash.mjs <email> <path> <name> : dashboard screenshots (light + dark, 1440) into screenshots/
import { chromium } from "playwright";
import { sessionCookies } from "./lib/session.mjs";
const [email, path, name] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://localhost:3100";
const b = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
  await ctx.addCookies((await sessionCookies(email)).cookies);
  const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.screenshot({ path: `screenshots/${name}-1440-${scheme}.png` });
  await ctx.close();
}
await b.close();
