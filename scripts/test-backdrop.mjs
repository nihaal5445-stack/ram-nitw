// Backdrop: warm light background, dark aurora animation, reduced-motion + hidden-tab pause, never blocks clicks. Needs `next start -p 3100`.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3100";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + String(detail).slice(0, 200)}`); if (!ok) failed++; };
const b = await chromium.launch();
const page = async (scheme, reduce = "no-preference") => { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, reducedMotion: reduce }); const p = await ctx.newPage(); await p.goto(BASE, { waitUntil: "networkidle" }); return p; };
const lum = (rgb) => { const [r, g, b2] = rgb.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; };
const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const L = await page("light");
const bgL = await L.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("light: warm off-white page background (not pure white)", bgL === "rgb(252, 249, 243)", bgL);
check("light: text on it keeps WCAG AA (>= 4.5)", ratio(bgL, await L.evaluate(() => getComputedStyle(document.body).color)) >= 4.5);
check("light: hero has the maroon-gold glow layer", await L.getByTestId("hero-glow").count() === 1);
check("the backdrop never intercepts clicks (pointer-events none)", (await L.getByTestId("bg-fx").evaluate((e) => getComputedStyle(e).pointerEvents)) === "none");
const at = await L.evaluate(() => { const e = document.elementFromPoint(640, 400); return !!e && !e.closest("[data-testid=bg-fx]"); });
check("elementFromPoint finds page content, not the backdrop", at);

const D = await page("dark");
const anim = await D.evaluate(() => document.getAnimations().filter((a) => a.animationName?.startsWith("fx-drift")).length);
check("dark: the aurora has 3 drifting glows, running", anim === 3, anim);
check("dark: aurora is visible (display block) and light glow hidden", (await D.evaluate(() => [getComputedStyle(document.querySelector(".fx-aurora")).display, getComputedStyle(document.querySelector(".fx-light-glow")).display])).join() === "block,none");
await D.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
check("hidden tab: animation is paused (fx-paused class + play-state)", (await D.evaluate(() => document.documentElement.classList.contains("fx-paused") && getComputedStyle(document.querySelector(".fx-blob-a")).animationPlayState)) === "paused");
await D.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
check("visible again: it resumes", (await D.evaluate(() => getComputedStyle(document.querySelector(".fx-blob-a")).animationPlayState)) === "running");
const R = await page("dark", "reduce");
check("prefers-reduced-motion: no backdrop animation at all", (await R.evaluate(() => document.getAnimations().filter((a) => a.animationName?.startsWith("fx-drift")).length)) === 0);
await b.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL BACKDROP TESTS PASSED");
process.exit(failed ? 1 : 0);
