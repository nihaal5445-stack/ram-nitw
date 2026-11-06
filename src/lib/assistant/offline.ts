import type { Summary } from "./summary";

const MESS_WORDS: [string, RegExp][] = [["IFC-A", /ifc[- ]?a\b/i], ["IFC-B", /ifc[- ]?b\b/i], ["Krishna Mess", /krishna/i], ["Priyadarshini Mess", /priyadarshini/i]];

/** Deterministic answers from the summary: top issues, what to fix first, trends, counts, crowd, likes, feedback. Always labelled "Offline summary" by the caller. */
export function answerOffline(question: string, s: Summary): string {
  const q = question.toLowerCase();
  const mess = MESS_WORDS.find(([, re]) => re.test(question))?.[0] ?? null;
  const inScope = !mess || s.scope.includes(mess) || s.crowd.some((c) => c.mess === mess) || s.feedback.some((f) => f.mess === mess);
  const topics = s.complaints.topics.filter((t) => !mess || t.mess === mess);
  const where = mess ?? (s.scope.length === 1 ? s.scope[0] : "all messes you can see");
  const week = /week|7 day|recent|lately/.test(q);
  const lines: string[] = [];

  if (mess && !s.scope.includes(mess) && /complaint|issue|fix|trend|week/.test(q)) {
    return `I have no complaint data for ${mess} in your scope.${s.scope.length ? ` I can see: ${s.scope.join(", ")}.` : ""}`;
  }

  if (/fix first|priorit|urgent|most important|what should we/.test(q)) {
    const ranked = [...topics].sort((a, b) => b.open - a.open || b.last7 - a.last7).filter((t) => t.open > 0);
    if (!ranked.length) return `Nothing open at ${where}. ${s.complaints.total} complaints in total, all answered.`;
    const t = ranked[0];
    lines.push(`Fix first: ${t.topic} at ${t.mess} (${t.open} open, ${t.last7} in the last 7 days).`);
    ranked.slice(1, 3).forEach((r, i) => lines.push(`${i + 2}. ${r.topic} at ${r.mess}: ${r.open} open.`));
    if (s.complaints.overdueSla) lines.push(`${s.complaints.overdueSla} open complaint(s) are past the 30-minute SLA: answer those first.`);
    return lines.join("\n");
  }
  if (/top issue|issues|complaint|problem/.test(q) && !/how many|count|total/.test(q)) {
    const key = week ? "last7" : "total";
    const ranked = [...topics].filter((t) => t[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 4);
    if (!ranked.length) return `No complaints ${week ? "in the last 7 days " : ""}for ${where}.`;
    lines.push(`Top issues at ${where}${week ? " (last 7 days)" : ""}:`);
    ranked.forEach((t, i) => lines.push(`${i + 1}. ${t.topic}${mess ? "" : ` at ${t.mess}`}: ${t[key]} complaint(s), ${t.open} still open.`));
    return lines.join("\n");
  }
  if (/trend|compare|increas|decreas|better|worse|per day|daily/.test(q)) {
    const { last7, prev7, byDay } = s.complaints;
    const dir = last7 > prev7 ? "up" : last7 < prev7 ? "down" : "flat";
    lines.push(`Complaints: ${last7} in the last 7 days vs ${prev7} the 7 days before (${dir}).`);
    if (byDay.length) lines.push(`Per day: ${byDay.map((d) => `${d.date.slice(5)}: ${d.n}`).join(", ")}.`);
    const fb = s.feedback.filter((f) => !mess || f.mess === mess);
    if (fb.length) lines.push(`Feedback: ${fb.map((f) => `${f.mess} ${f.avg}/5 (${f.n})`).join(", ")}.`);
    return lines.join("\n");
  }
  if (/how many|count|total|number/.test(q)) {
    const c = s.complaints;
    return `${c.total} complaints in total at ${where}: ${c.open} open, ${c.total - c.open} answered; ${c.last7} in the last 7 days; ${c.overdueSla} open past the 30-minute SLA.`;
  }
  if (/crowd|busy|queue|full|rush|wait/.test(q)) {
    const rows = s.crowd.filter((c) => !mess || c.mess === mess);
    if (!rows.length) return "No crowd data right now.";
    const busiest = [...rows].sort((a, b) => b.pct - a.pct)[0], quietest = [...rows].sort((a, b) => a.pct - b.pct)[0];
    lines.push(rows.map((c) => `${c.mess}: ${c.level === "closed" ? "closed" : c.pct + "%"}`).join(", ") + ".");
    if (busiest.pct >= 70) lines.push(`${busiest.mess} is the busiest${busiest.tryAfter ? `; students could try after ${busiest.tryAfter}` : ""}. ${quietest.mess} is the quietest.`);
    return lines.join("\n");
  }
  if (/like|dish|popular|favou?rite|love|liked/.test(q)) {
    const rows = s.likes.filter((l) => !mess || l.mess === mess).slice(0, 5);
    return rows.length ? "Most-liked dishes (7 days):\n" + rows.map((l, i) => `${i + 1}. ${l.dish} at ${l.mess}: ${l.n} likes`).join("\n") : "No dish likes yet.";
  }
  if (/feedback|rating|review|star|satisf/.test(q)) {
    const rows = s.feedback.filter((f) => !mess || f.mess === mess);
    return rows.length ? "Meal feedback: " + rows.map((f) => `${f.mess} ${f.avg}/5 from ${f.n} responses`).join("; ") + "." : "No meal feedback submitted yet.";
  }
  if (!inScope) return `I have no data for ${mess} in your scope.`;
  const c = s.complaints;
  lines.push(`Overview for ${where}: ${c.total} complaints (${c.open} open, ${c.overdueSla} past SLA), ${c.last7} this week vs ${c.prev7} last week.`);
  const top = [...topics].sort((a, b) => b.open - a.open)[0];
  if (top?.open) lines.push(`Biggest open issue: ${top.topic} at ${top.mess} (${top.open}).`);
  if (s.feedback.length) lines.push(`Feedback: ${s.feedback.map((f) => `${f.mess} ${f.avg}/5`).join(", ")}.`);
  lines.push("Try: top issues, what to fix first, trends, crowd, most-liked dishes.");
  return lines.join("\n");
}
