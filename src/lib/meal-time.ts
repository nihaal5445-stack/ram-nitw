import { mealSlots, type CrowdLevel, type MealSlot } from "@/config/demo-data";

/** Minutes since midnight in Asia/Kolkata for a given instant. */
export function istMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export interface SlotState {
  status: "serving" | "next";
  slot: MealSlot;
  tomorrow: boolean;
  /** minutes until the slot ends (serving) or starts (next) */
  minutes: number;
}

export function slotState(now: Date): SlotState {
  const t = istMinutes(now);
  for (const slot of mealSlots) {
    const s = toMin(slot.start), e = toMin(slot.end);
    if (t >= s && t < e) return { status: "serving", slot, tomorrow: false, minutes: e - t };
  }
  const upcoming = mealSlots.find((s) => toMin(s.start) > t);
  if (upcoming) return { status: "next", slot: upcoming, tomorrow: false, minutes: toMin(upcoming.start) - t };
  return { status: "next", slot: mealSlots[0], tomorrow: true, minutes: 24 * 60 - t + toMin(mealSlots[0].start) };
}

/** Demo-only crowd estimate: busy at the start of a slot, easing off towards the end. */
export function crowdFor(now: Date): CrowdLevel | null {
  const st = slotState(now);
  if (st.status !== "serving") return null;
  const len = toMin(st.slot.end) - toMin(st.slot.start);
  const elapsed = len - st.minutes;
  if (elapsed < len * 0.3) return "busy";
  if (elapsed < len * 0.65) return "moderate";
  return "low";
}
