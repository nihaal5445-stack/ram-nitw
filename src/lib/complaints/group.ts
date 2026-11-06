/** Deterministic grouping, summary and reply drafting for complaints. Used as the fallback when no LLM key is configured. */
export const CATEGORIES = ["food_quality", "hygiene", "quantity", "service", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface AdminComplaint {
  id: string; mess_id: string; category: Category; meal_date: string; slot: string; body: string; anonymous: boolean; filer_name: string | null;
  status: "open" | "in_progress" | "resolved" | "cannot_resolve"; reply: string | null; cannot_reason: string | null; responded_at: string | null; posted_at: string | null;
  created_at: string; sla_due: string | null;
}

interface Topic { key: string; label: string; words: RegExp; action: string }
const TOPICS: Topic[] = [
  { key: "cold_stale", label: "cold or stale food", words: /\b(cold|stale|old|not fresh|leftover|yesterday|smell(s|ed)? (bad|off))\b/i, action: "checked holding temperatures and asked the kitchen to serve fresh batches" },
  { key: "undercooked", label: "undercooked food", words: /\b(raw|undercook\w*|half[- ]cooked|hard rice|uncooked)\b/i, action: "reviewed cooking times with the kitchen supervisor" },
  { key: "taste", label: "taste problems (salt, spice, oil)", words: /\b(salt\w*|spic\w*|bland|tasteless|oily|oil|taste\w*|sweet)\b/i, action: "asked the cooks to correct the seasoning and will sample each batch before serving" },
  { key: "foreign", label: "foreign objects in food", words: /\b(hair|insect|cockroach|fly|flies|worm|plastic|stone|pebble|bug)\b/i, action: "inspected the kitchen and serving line and tightened food-safety checks" },
  { key: "cleanliness", label: "cleanliness", words: /\b(dirty|unclean|filth\w*|stink\w*|smell\w*|unhygienic|wash\w*|tables?|plates?|spoons?|floor)\b/i, action: "had the dining hall and utensils cleaned and added a cleaning round during service" },
  { key: "quantity", label: "serving quantity", words: /\b(less|little|ran out|run out|finished|portion\w*|quantity|empty|not enough|limited)\b/i, action: "asked the counter to refill earlier and to follow the standard portion size" },
  { key: "queue", label: "queues and waiting", words: /\b(queue\w*|wait\w*|slow\w*|line|crowd\w*|rush\w*)\b/i, action: "added a serving counter during peak minutes" },
  { key: "behaviour", label: "staff behaviour", words: /\b(rude\w*|behav\w*|shout\w*|misbehav\w*|abus\w*)\b/i, action: "spoken to the staff concerned" },
];
const CATEGORY_LABEL: Record<Category, string> = {
  food_quality: "food quality", hygiene: "hygiene", quantity: "serving quantity", service: "service", other: "other issues",
};

export const topicOf = (c: Pick<AdminComplaint, "body" | "category">): Topic =>
  TOPICS.find((t) => t.words.test(c.body)) ?? { key: `cat_${c.category}`, label: CATEGORY_LABEL[c.category], words: /$^/, action: "looked into it with the kitchen supervisor" };

export interface Issue {
  key: string; messId: string; date: string; slot: string; topic: string; topicLabel: string; action: string;
  complaints: AdminComplaint[]; summary: string; source: "rules" | "ai"; drafts: Record<string, string>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function draftReply(c: AdminComplaint, topicLabel: string, action: string, messName: string, slotLabel: string): string {
  const hello = c.anonymous || !c.filer_name ? "Hello," : `Hello ${c.filer_name.split(" ")[0]},`;
  return `${hello} thank you for reporting ${topicLabel} at ${messName} during ${slotLabel} on ${c.meal_date}. We have ${action}. If you see it again, please tell us right away so we can act during the meal. - Mess administration`;
}

export function groupComplaints(rows: AdminComplaint[], messName: (id: string) => string): Issue[] {
  const map = new Map<string, Issue>();
  for (const c of rows) {
    const t = topicOf(c);
    const key = `${c.mess_id}|${c.meal_date}|${c.slot}|${t.key}`;
    let g = map.get(key);
    if (!g) { g = { key, messId: c.mess_id, date: c.meal_date, slot: c.slot, topic: t.key, topicLabel: t.label, action: t.action, complaints: [], summary: "", source: "rules", drafts: {} }; map.set(key, g); }
    g.complaints.push(c);
  }
  const issues = [...map.values()];
  for (const g of issues) {
    const n = g.complaints.length;
    const named = g.complaints.filter((c) => !c.anonymous).length;
    const quote = g.complaints[0].body.length > 110 ? g.complaints[0].body.slice(0, 107) + "..." : g.complaints[0].body;
    g.summary = `${n} ${n === 1 ? "report" : "reports"} of ${g.topicLabel} at ${messName(g.messId)}, ${g.slot} on ${g.date}${n > 1 ? ` (${named} named, ${n - named} anonymous)` : ""}. Example: "${quote}"`;
    for (const c of g.complaints) g.drafts[c.id] = draftReply(c, g.topicLabel, g.action, messName(g.messId), g.slot);
  }
  return issues.sort((a, b) => b.complaints.length - a.complaints.length || b.date.localeCompare(a.date));
}

export { cap };
