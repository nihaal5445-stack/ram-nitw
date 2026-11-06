// npm run demo:prep: reset the DB (migrations + seed), apply DEMO_MODE from .env.local, print the logins, then keep the crowd alive.
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { demoModeFromEnv, setDemoMode } from "./lib/demo-mode.mjs";
import { supabaseEnv } from "./lib/session.mjs";

const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0;
console.log("1/3 npm run db:reset ...");
if (!run("npm", ["run", "db:reset"])) { console.error("db:reset failed (is Supabase running? `npx supabase start -x logflare,vector,imgproxy,edge-runtime,studio`)"); process.exit(1); }

console.log("2/3 waiting for the API, then applying DEMO_MODE from .env.local ...");
const env = supabaseEnv();
const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (let i = 0; ; i++) {
  const { error } = await db.from("app_settings").select("key").limit(1);
  if (!error) break;
  if (i > 40) { console.error("API did not come back: " + error.message); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));
}
const on = demoModeFromEnv();
await setDemoMode(on);
console.log(`DEMO MODE: ${on ? "ON (every time counts as an open meal slot)" : "OFF (real slot rules; scans only work inside a meal window)"}`);

console.log(`
Demo logins (password for scripts: password123; in the UI use the email code from http://127.0.0.1:54324)
  Student (IFC-A, pure veg)   student@student.nitw.ac.in     Students tab
  Student 2 (IFC-B)           student2@student.nitw.ac.in    Students tab    roll DEMO0002
  Counter (IFC-A)             counter@nitw.ac.in             Mess Staff & Administration
  Mess admin IFC-A            admin@nitw.ac.in               Mess Staff & Administration
  Mess admin IFC-B            admin-ifcb@nitw.ac.in          Mess Staff & Administration  (can also open the scanner)
  Parent (of Student 1)       parent@example.com             Parents
  Warden                      warden@nitw.ac.in              Mess Staff & Administration
Start the app in another terminal: NODE_ENV=production npm run build && NODE_ENV=production npx next start -p 3100
Script: docs/DEMO_SCRIPT.md
`);

console.log("3/3 npm run demo:crowd -- --keep (Ctrl+C to stop)");
const child = spawn("node", ["scripts/demo-crowd.mjs", "--keep"], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
