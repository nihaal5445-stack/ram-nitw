import type { SupabaseClient } from "@supabase/supabase-js";
import { messes } from "@/config/messes";
import { topicOf, type AdminComplaint } from "@/lib/complaints/group";

/** Compact, AGGREGATE-ONLY snapshot for the assistant. No complaint text, no names, no ids: anonymous complainants cannot leak by construction. */
export interface Summary {
  scope: string[];
  today: string;
  complaints: {
    total: number; open: number; overdueSla: number; last7: number; prev7: number;
    byDay: { date: string; n: number }[];
    topics: { mess: string; topic: string; total: number; open: number; last7: number }[];
  };
  feedback: { mess: string; n: number; avg: number }[];
  likes: { mess: string; dish: string; n: number }[];
  crowd: { mess: string; pct: number; level: string; tryAfter: string | null }[];
}

const nameOf = (id: string) => messes.find((m) => m.id === id)?.name ?? id;
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(ms);

export async function buildSummary(db: SupabaseClient, nowMs: number): Promise<Summary> {
  const [c, f, l, w] = await Promise.all([db.rpc("admin_complaints"), db.rpc("mess_feedback_summary"), db.rpc("top_liked_dishes", { p_days: 7 }), db.rpc("mess_crowd")]);
  const rows = (c.data ?? []) as AdminComplaint[];
  const d7 = nowMs - 7 * 86_400_000, d14 = nowMs - 14 * 86_400_000;
  const topics = new Map<string, Summary["complaints"]["topics"][number]>();
  const perDay = new Map<string, number>();
  let last7 = 0, prev7 = 0, overdue = 0;
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    const k = `${r.mess_id}|${topicOf(r).label}`; // topic label only: the free text never leaves this function
    const e = topics.get(k) ?? { mess: nameOf(r.mess_id), topic: topicOf(r).label, total: 0, open: 0, last7: 0 };
    e.total++; if (r.status === "open") e.open++; if (t >= d7) e.last7++;
    topics.set(k, e);
    if (t >= d7) last7++; else if (t >= d14) prev7++;
    if (t >= d7) perDay.set(dayKey(t), (perDay.get(dayKey(t)) ?? 0) + 1);
    if (r.status === "open" && r.sla_due && Date.parse(r.sla_due) < nowMs) overdue++;
  }
  const scope = [...new Set(rows.map((r) => nameOf(r.mess_id)))];
  return {
    scope, today: dayKey(nowMs),
    complaints: {
      total: rows.length, open: rows.filter((r) => r.status === "open").length, overdueSla: overdue, last7, prev7,
      byDay: [...perDay.entries()].sort().map(([date, n]) => ({ date, n })),
      topics: [...topics.values()].sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 12),
    },
    feedback: ((f.data ?? []) as { mess_id: string; n: number; avg_stars: number }[]).map((x) => ({ mess: nameOf(x.mess_id), n: x.n, avg: Number(x.avg_stars) })),
    likes: ((l.data ?? []) as { mess_id: string; dish_key: string; n: number }[]).map((x) => ({ mess: nameOf(x.mess_id), dish: x.dish_key, n: x.n })),
    crowd: ((w.data ?? []) as { mess_id: string; pct: number; level: string; try_after: string | null }[]).map((x) => ({ mess: nameOf(x.mess_id), pct: x.pct, level: x.level, tryAfter: x.try_after?.slice(0, 5) ?? null })),
  };
}
