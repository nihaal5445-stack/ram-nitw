// npm run demo:phone : serve the app (production build with the Supabase proxy) and open a cloudflared quick tunnel, so a PHONE only needs
// the printed https URL (camera + WebCrypto need HTTPS; the phone reaches Supabase through the app at /sb). Stop with `npm run demo:phone:stop`.
import { spawn, spawnSync, execSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import qrcode from "qrcode-generator";
import { supabaseEnv } from "./lib/session.mjs";

const DIR = new URL("../.demo-phone/", import.meta.url).pathname;
const PORT = 3100;
mkdirSync(DIR, { recursive: true });
const sh = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

if (existsSync(DIR + "state.json")) {
  const st = JSON.parse(readFileSync(DIR + "state.json", "utf8"));
  if (alive(st.tunnelPid)) { console.log(`A phone tunnel is already running:\n\n  ${st.url}\n\nStop it first with: npm run demo:phone:stop`); process.exit(0); }
}
if (!sh("which cloudflared")) { console.error("cloudflared is not installed (brew install cloudflared)."); process.exit(1); }

console.log("1/5 checking Supabase ...");
const env = supabaseEnv();
const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if ((await db.from("app_settings").select("key").limit(1)).error) { console.error("Supabase is not reachable. Start it: npx supabase start -x logflare,vector,imgproxy,edge-runtime,studio  (then npm run demo:prep)"); process.exit(1); }

console.log("2/5 locking the seed passwords (the tunnel is public: 'password123' must not work on it) ...");
spawnSync("node", ["scripts/demo-lock-seed.mjs"], { stdio: "ignore" });

console.log("3/5 building the app with the Supabase proxy (about 1 minute) ...");
const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_PROXY: "1" } });
if (build.status !== 0) { console.error("build failed"); process.exit(1); }

console.log("4/5 starting the app on :" + PORT + " ...");
const old = sh(`lsof -ti tcp:${PORT}`); if (old) for (const p of old.split("\n")) { try { process.kill(Number(p)); } catch {} }
await new Promise((r) => setTimeout(r, 800));
const nextLog = openSync(DIR + "next.log", "w");
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { detached: true, stdio: ["ignore", nextLog, nextLog], env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_PROXY: "1" } });
server.unref();
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/api/time`)).ok) break; } catch {}
  if (i > 40) { console.error("the app did not start; see .demo-phone/next.log"); process.exit(1); }
  await new Promise((r) => setTimeout(r, 500));
}

console.log("5/5 opening the cloudflared tunnel ...");
const tlog = openSync(DIR + "tunnel.log", "w");
const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { detached: true, stdio: ["ignore", tlog, tlog] });
tunnel.unref();
let url = null;
for (let i = 0; i < 80 && !url; i++) {
  await new Promise((r) => setTimeout(r, 500));
  url = readFileSync(DIR + "tunnel.log", "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
}
if (!url) { console.error("no tunnel URL after 40 s; see .demo-phone/tunnel.log"); try { process.kill(tunnel.pid); } catch {} process.exit(1); }
// the tunnel needs a few seconds before the hostname resolves everywhere: wait until it answers
for (let i = 0; i < 30; i++) { try { if ((await fetch(url + "/api/time")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }

writeFileSync(DIR + "state.json", JSON.stringify({ url, serverPid: server.pid, tunnelPid: tunnel.pid, startedAt: new Date().toISOString() }));
const q = qrcode(0, "L"); q.addData(url + "/login"); q.make();
console.log(`
============================================================
  PHONE URL:  ${url}/login
============================================================
${q.createASCII(1, 2)}
Sign in on the phone with the EMAIL CODE (the seed passwords are locked while the tunnel is up):
  1. phone: open the URL above, tab "Mess Staff & Administration", email  admin-ifcb@nitw.ac.in
  2. laptop: open http://127.0.0.1:54324 (Mailpit), read the 6-digit code, type it on the phone
  3. phone: Dashboard -> open the scanner (/dashboard/counter/scan), pick a PIN, Start shift
  4. laptop: http://localhost:${PORT}  sign in as student2@student.nitw.ac.in -> "Show my meal QR" (enrol first time)
     and, in another browser profile, admin-ifcb@nitw.ac.in -> /dashboard/admin to watch the head count
  5. phone: point the camera at the laptop's QR -> big green result; the laptop admin head count goes up by itself
Stop:  npm run demo:phone:stop   (closes the tunnel and the app, restores the seed passwords)
`);
