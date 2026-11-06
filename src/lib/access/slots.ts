/** Pure meal-slot helpers shared by the scanner (offline) and tests. All times are Asia/Kolkata. */
export interface SlotWindow { slot: string; starts: string; ends: string } // "HH:MM" 24h IST

export function istParts(ms: number): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => f.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Slot whose window (plus `graceMin` either side) contains the time; null if none. */
export function slotAt(slots: SlotWindow[], ms: number, graceMin = 15): { slot: string; date: string } | null {
  const { date, minutes } = istParts(ms);
  const hit = slots.find((s) => minutes >= toMin(s.starts) - graceMin && minutes < toMin(s.ends) + graceMin);
  return hit ? { slot: hit.slot, date } : null;
}

export const ledgerKey = (studentId: string, date: string, slot: string) => `${studentId}|${date}|${slot}`;

/** The slot being served right now (no grace), or null. Server components call this instead of touching Date.now(). */
export const currentSlot = (slots: SlotWindow[]) => slotAt(slots, Date.now(), 0);
