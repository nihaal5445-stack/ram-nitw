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
