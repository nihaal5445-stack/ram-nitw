// npm run test:all: runs EVERY suite (a failure does not stop the rest), with DEMO MODE forced off (the suites assert the real
// slot rules), then restores DEMO_MODE from .env.local. Needs Supabase running and `next start -p 3100`. Exit 1 if any suite failed.
import { spawnSync } from "node:child_process";
import { demoModeFromEnv, setDemoMode } from "./lib/demo-mode.mjs";

// dashboards needs the fraud flags that the access suite creates, so it runs right after it
const suites = ["test:unit", "test:db", "test:signup", "test:login-code", "test:student-token", "test:access", "test:dashboards", "test:addons", "test:demo-mode", "test:switch", "test:likes", "test:assistant", "test:complaints", "test:replies", "test:feedback", "test:scanner"];
const results = [];
await setDemoMode(false);
try {
  for (const s of suites) {
    console.log(`\n===== npm run ${s} =====`);
    const t0 = Date.now();
    const r = spawnSync("npm", ["run", s], { stdio: "inherit" });
    results.push({ suite: s, ok: r.status === 0, secs: Math.round((Date.now() - t0) / 1000) });
  }
} finally {
  await setDemoMode(demoModeFromEnv());
}
console.log("\n===== summary =====");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.suite.padEnd(20)} ${r.secs}s`);
const bad = results.filter((r) => !r.ok);
console.log(bad.length ? `\n${bad.length} of ${results.length} suites FAILED: ${bad.map((b) => b.suite).join(", ")}` : `\nALL ${results.length} SUITES PASSED`);
process.exit(bad.length ? 1 : 0);
