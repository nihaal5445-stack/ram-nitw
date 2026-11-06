import type { Dish, MealId } from "./demo-data";

/**
 * DEMO weekly menu, the same rotation for every mess (pure-veg messes show only the veg items). Placeholder until Phase 4 moves menus
 * into the database and mess reps publish them. TODO: verify with each mess. Dish names: messages/en.json -> Public.dishes.<key>.
 */
const NONVEG = new Set(["boiledEgg", "chickenCurry", "eggCurry", "omelette", "chickenBiryani", "fishCurry", "eggBhurji"]);
const d = (keys: string[]): Dish[] => keys.map((key) => ({ key, veg: !NONVEG.has(key) }));

// index 0 = Sunday ... 6 = Saturday (same as Date.getDay())
const W: Record<MealId, string[][]> = {
  breakfast: [
    ["puri", "tadkaDal", "banana", "tea"],
    ["idli", "sambar", "chutney", "boiledEgg"],
    ["dosa", "sambar", "chutney", "coffee"],
    ["poha", "bread", "omelette", "tea"],
    ["pongal", "vada", "chutney", "coffee"],
    ["upma", "chutney", "boiledEgg", "tea"],
    ["paratha", "curd", "pickleSalad", "tea"],
  ],
  lunch: [
    ["vegBiryani", "chickenBiryani", "raita", "salad"],
    ["rice", "dal", "paneerCurry", "chickenCurry", "curd"],
    ["rice", "rajma", "aloGobi", "curd", "salad"],
    ["rice", "dal", "mixedVeg", "fishCurry", "curd"],
    ["jeeraRice", "chole", "roti", "curd", "salad"],
    ["rice", "tadkaDal", "palakPaneer", "eggCurry", "curd"],
    ["rice", "dal", "aloGobi", "chickenCurry", "kheer"],
  ],
  snacks: [
    ["samosa", "tea"],
    ["bonda", "coffee"],
    ["pakora", "tea"],
    ["cutlet", "coffee"],
    ["samosa", "tea"],
    ["noodlesSnack", "coffee"],
    ["gulabJamun", "tea"],
  ],
  dinner: [
    ["chapati", "paneerCurry", "dal", "kheer"],
    ["chapati", "mixedVeg", "dal", "eggCurry", "fruit"],
    ["rice", "tadkaDal", "palakPaneer", "eggBhurji", "salad"],
    ["chapati", "chole", "dal", "fruit"],
    ["roti", "paneerCurry", "dal", "chickenCurry", "curd"],
    ["vegBiryani", "raita", "salad", "gulabJamun"],
    ["chapati", "mixedVeg", "dal", "eggCurry", "fruit"],
  ],
};

/** Menu for a meal on a weekday (0 = Sunday). */
export const menuFor = (meal: MealId, weekday: number): Dish[] => d(W[meal][((weekday % 7) + 7) % 7]);

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Weekday (0 = Sunday) in Asia/Kolkata for an instant, plus `offset` days. */
export function istWeekday(now: Date, offset = 0): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now);
  return (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) + offset + 7) % 7;
}
