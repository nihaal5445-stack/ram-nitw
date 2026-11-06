export type CrowdLevelNow = "low" | "moderate" | "busy" | "closed";
export interface CrowdRow {
  mess_id: string;
  scans_10m: number;
  seats: number;
  pct: number;
  level: CrowdLevelNow;
  slot: string | null;
  slot_ends: string | null;
  try_after: string | null; // "HH:MM:SS" IST
  includes_demo: boolean;
}

/** "You could try after 12:40" style hint; null when not busy. */
export function crowdHint(r: CrowdRow, name: string): { name: string; pct: number; after: string | null } | null {
  if (r.level !== "busy" && !(r.level === "moderate" && r.pct >= 70)) return null;
  return { name, pct: r.pct, after: r.try_after ? r.try_after.slice(0, 5) : null };
}
