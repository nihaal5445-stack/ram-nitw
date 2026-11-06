/**
 * DEMO DATA for the public site. Everything here is a placeholder until the
 * menu/attendance phases move it to the database. TODO: verify with the Chief Warden's office.
 */
export type MealId = "breakfast" | "lunch" | "snacks" | "dinner";
export interface MealSlot { id: MealId; start: string; end: string } // 24h IST "HH:MM"

// TODO: verify all timings
export const mealSlots: MealSlot[] = [
  { id: "breakfast", start: "07:30", end: "09:30" },
  { id: "lunch", start: "12:00", end: "14:00" },
  { id: "snacks", start: "16:30", end: "17:30" },
  { id: "dinner", start: "19:30", end: "21:30" },
];

export interface Dish { key: string; veg: boolean }
// Dish names are translated under Public.dishes.<key>. TODO: verify menus
export const baseMenu: Record<MealId, Dish[]> = {
  breakfast: [
    { key: "idli", veg: true }, { key: "sambar", veg: true }, { key: "vada", veg: true },
    { key: "chutney", veg: true }, { key: "boiledEgg", veg: false },
  ],
  lunch: [
    { key: "rice", veg: true }, { key: "dal", veg: true }, { key: "paneerCurry", veg: true },
    { key: "chickenCurry", veg: false }, { key: "curd", veg: true },
  ],
  snacks: [{ key: "samosa", veg: true }, { key: "tea", veg: true }],
  dinner: [
    { key: "chapati", veg: true }, { key: "mixedVeg", veg: true }, { key: "dal", veg: true },
    { key: "eggCurry", veg: false }, { key: "fruit", veg: true },
  ],
};

export type CrowdLevel = "low" | "moderate" | "busy";

export interface MessDemo {
  rating: number; // out of 5. TODO: verify (demo)
  /** shifts the crowd estimate: +1 busier, -1 quieter */
  crowdBias: -1 | 0 | 1;
  addOns: string[]; // keys under Public.messSections.addOnItems
  updateDate: string; // ISO date; text under Public.messSections.updates.<id with _>
}

// All demo values. TODO: verify with the Chief Warden's office.
export const messDemo: Record<string, MessDemo> = {
  "ifc-a": { rating: 4.2, crowdBias: 1, addOns: ["sweet", "fruit", "juice"], updateDate: "2026-11-04" },
  "ifc-b": { rating: 3.9, crowdBias: 0, addOns: ["egg", "sweet", "juice"], updateDate: "2026-11-03" },
  krishna: { rating: 4.0, crowdBias: 1, addOns: ["paneer", "sweet", "egg"], updateDate: "2026-11-05" },
  priyadarshini: { rating: 4.3, crowdBias: -1, addOns: ["fruit", "sweet", "egg"], updateDate: "2026-11-02" },
};

/** Headline figures. `demo: true` ones are placeholders. TODO: verify / replace with real data. */
export const stats = [
  { id: "meals", value: 6200, decimals: 0, demo: true },
  { id: "tokens", value: 18500, decimals: 0, demo: true },
  { id: "rating", value: 4.1, decimals: 1, demo: true },
] as const;

export interface ProgressEntry { id: string; date: string; messId: string | "all"; status: "done" | "inProgress" }
/** Improvements only, never complaints. Text under Public.progress.items.<id>. DEMO DATA, TODO: verify. */
export const progress: ProgressEntry[] = [
  { id: "p1", date: "2026-11-05", messId: "krishna", status: "done" },
  { id: "p2", date: "2026-11-04", messId: "ifc-a", status: "done" },
  { id: "p3", date: "2026-11-03", messId: "ifc-b", status: "done" },
  { id: "p4", date: "2026-11-02", messId: "priyadarshini", status: "done" },
  { id: "p5", date: "2026-11-01", messId: "all", status: "done" },
  { id: "p6", date: "2026-10-30", messId: "all", status: "inProgress" },
];

export interface CalendarEvent { id: string; date: string; type: "special" | "closure"; messId: string | "all" }
/** DEMO DATA. TODO: verify every date with the Chief Warden's office (festival dates especially). Text under Public.calendar.items.<id>. */
export const calendarEvents: CalendarEvent[] = [
  { id: "c1", date: "2026-11-08", type: "special", messId: "all" },
  { id: "c2", date: "2026-11-14", type: "closure", messId: "ifc-a" },
  { id: "c3", date: "2026-11-20", type: "special", messId: "all" },
  { id: "c4", date: "2026-12-20", type: "closure", messId: "all" },
];
