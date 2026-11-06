// node scripts/demo-mode.mjs on|off|env   (env = apply DEMO_MODE from .env.local)
import { demoModeFromEnv, setDemoMode } from "./lib/demo-mode.mjs";

const arg = process.argv[2] ?? "env";
const on = arg === "env" ? demoModeFromEnv() : arg === "on";
if (!["on", "off", "env"].includes(arg)) { console.error("usage: demo-mode.mjs on|off|env"); process.exit(2); }
await setDemoMode(on);
console.log(`DEMO MODE is now ${on ? "ON (every time counts as an open meal slot)" : "OFF (real slot rules)"}`);
