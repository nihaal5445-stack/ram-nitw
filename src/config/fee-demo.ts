/** DEMO DATA for fee transparency. Illustrative placeholders, NOT audited accounts. TODO: replace with real figures from the accounts office. */
export const monthlyFeeRs = 4500; // TODO: verify

// Shares sum to 100. Labels are translated under Fees.cat.<key>.
export const feeShares = [
  { key: "groceries", pct: 38 },
  { key: "fresh", pct: 22 },
  { key: "staff", pct: 20 },
  { key: "fuel", pct: 8 },
  { key: "hygiene", pct: 6 },
  { key: "waste", pct: 3 },
  { key: "reserve", pct: 3 },
] as const;

// Rs per student per month, last six months (food = groceries + fresh; staff; other = the rest).
export const feeTrend = [
  { month: "Jun", food: 2580, staff: 880, other: 1040 },
  { month: "Jul", food: 2640, staff: 890, other: 1010 },
  { month: "Aug", food: 2700, staff: 900, other: 980 },
  { month: "Sep", food: 2690, staff: 900, other: 960 },
  { month: "Oct", food: 2720, staff: 905, other: 925 },
  { month: "Nov", food: 2700, staff: 900, other: 900 },
];
