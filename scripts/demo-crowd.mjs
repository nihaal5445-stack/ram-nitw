// Seeds believable DEMO arrivals so the Surge Heatmap looks alive "now".
//   npm run demo:crowd            re-seed once (history for today's slots + the last 10 minutes)
//   npm run demo:crowd -- --keep  also keep topping up every 15 s so the crowd stays steady (Ctrl+C to stop)
// Demo rows live in public.demo_crowd_scans (not in meal_redemptions); the UI says "demo" when they contribute.
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./lib/session.mjs";

const env = supabaseEnv();
const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const keep = process.argv.includes("--keep");

// pct of "full" (see mess_crowd()): IFC-B is the hot spot, Priyadarshini is quiet.
const targetPct = { "ifc-a": 38, "ifc-b": 86, krishna: 62, priyadarshini: 22 };
const seats = { "ifc-a": 800, "ifc-b": 800, krishna: 1000, priyadarshini: 600 };
const slots = [["07:30", "09:30"], ["12:00", "14:00"], ["16:30", "17:30"], ["19:30", "21:30"]]; // TODO: verify, mirrors mess_slots
const IST = 5.5 * 3600e3;
const rnd = (a, b) => a + Math.random() * (b - a);

const istMidnightUtc = () => { const n = Date.now() + IST; return n - (n % 86400e3) - IST; };
const at = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return istMidnightUtc() + (h * 60 + m) * 60e3; };

async function insert(rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("demo_crowd_scans").insert(rows.slice(i, i + 1000));
    if (error) throw new Error(error.message);
  }
}

async function seedOnce() {
  const { error } = await db.from("demo_crowd_scans").delete().gte("id", 0);
  if (error) throw new Error(error.message);
  const now = Date.now(), cutoff = now - 10 * 60e3;
  const rows = [];
  for (const [mess, s] of Object.entries(seats)) {
    // history: a bell-shaped rush (peak about 25% into the slot) for every slot that has started, older than 10 min
    for (const [a, b] of slots) {
      const start = at(a), end = at(b);
      if (start >= cutoff) continue;
      const total = Math.round(s * rnd(0.55, 0.8));
      for (let i = 0; i < total; i++) {
        const u = (Math.random() + Math.random() + Math.random()) / 3; // bell
        const t = start + Math.pow(u, 1.4) * (end - start) * 0.9;
        if (t < Math.min(end, cutoff)) rows.push({ mess_id: mess, scanned_at: new Date(t).toISOString() });
      }
    }
    // the live window: exactly the target crowd in the last 10 minutes, a little denser towards "now"
    const n = Math.round((targetPct[mess] / 100) * (s / 4));
    for (let i = 0; i < n; i++) rows.push({ mess_id: mess, scanned_at: new Date(now - Math.pow(Math.random(), 1.3) * 590e3).toISOString() });
  }
  await insert(rows);
  console.log(`seeded ${rows.length} demo scans`);
}

await seedOnce();
const show = async () => {
  const { data } = await db.rpc("mess_crowd");
  console.table(data.map((r) => ({ mess: r.mess_id, scans_10m: r.scans_10m, pct: r.pct, level: r.level, try_after: r.try_after })));
};
await show();

if (keep) {
  console.log("keeping the crowd alive (Ctrl+C to stop)");
  setInterval(async () => {
    const rows = [];
    for (const [mess, s] of Object.entries(seats)) {
      const per = ((targetPct[mess] / 100) * (s / 4)) / 40; // 40 intervals of 15 s per 10 min
      const n = Math.max(0, Math.round(per + rnd(-1, 1)));
      for (let i = 0; i < n; i++) rows.push({ mess_id: mess, scanned_at: new Date(Date.now() - rnd(0, 14e3)).toISOString() });
    }
    try { await insert(rows); } catch (e) { console.error(e.message); }
  }, 15e3);
} else process.exit(0);
