// npm run demo:phone:stop : close the tunnel and the app, restore the public seed passwords.
import { spawnSync, execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";

const DIR = new URL("../.demo-phone/", import.meta.url).pathname;
const kill = (pid) => { try { process.kill(pid); return true; } catch { return false; } };
if (existsSync(DIR + "state.json")) {
  const st = JSON.parse(readFileSync(DIR + "state.json", "utf8"));
  console.log(`tunnel ${kill(st.tunnelPid) ? "stopped" : "was not running"}, app ${kill(st.serverPid) ? "stopped" : "was not running"}`);
  rmSync(DIR + "state.json");
} else console.log("no state file: nothing recorded as running");
try { for (const p of execSync("lsof -ti tcp:3100", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").filter(Boolean)) kill(Number(p)); } catch {}
try { execSync("pkill -f 'cloudflared tunnel'", { stdio: "ignore" }); } catch {}
const r = spawnSync("node", ["scripts/demo-lock-seed.mjs", "--restore"], { stdio: "ignore" });
console.log(r.status === 0 ? "seed passwords restored (password123)" : "could not restore the seed passwords (is Supabase running?)");
console.log("The app was built WITH the Supabase proxy. Before running tests or a normal demo rebuild without it:\n  NODE_ENV=production npm run build && NODE_ENV=production npx next start -p 3100");
