export type MessType = "veg" | "mixed" | "north_indian";
/** confirmed = verified operational mess; unconfirmed = exists but name/details not yet confirmed. */
export type MessStatus = "confirmed" | "unconfirmed" | "under_construction";

export interface MessConfig {
  id: string;
  /** Display name. Placeholders are labelled plainly, never invented. */
  name: string;
  type: MessType;
  menuStyle: string;
  eligibleGroups: string[];
  capacity: number;
  status: MessStatus;
  location: { lat: number; lng: number };
}

// All coordinates below are spread placeholders around the campus centre.
// TODO: verify every lat/lng, capacity and eligibility with the Chief Warden's office.
export const CAMPUS_CENTER = { lat: 17.9835, lng: 79.5305 }; // TODO: verify

export const messes: MessConfig[] = [
  {
    id: "ifc-a",
    name: "IFC-A",
    type: "veg",
    menuStyle: "Pure vegetarian",
    eligibleGroups: ["Pure-vegetarian students"], // TODO: verify
    capacity: 800, // TODO: verify
    status: "confirmed",
    location: { lat: 17.9848, lng: 79.5292 }, // TODO: verify
  },
  {
    id: "ifc-b",
    name: "IFC-B",
    type: "mixed",
    menuStyle: "South and North Indian mixed menu", // TODO: verify
    eligibleGroups: ["All students"], // TODO: verify
    capacity: 800, // TODO: verify
    status: "confirmed",
    location: { lat: 17.9852, lng: 79.5318 }, // TODO: verify
  },
  {
    id: "krishna",
    name: "Krishna Mess",
    type: "north_indian",
    menuStyle: "North Indian menu", // TODO: verify
    eligibleGroups: ["All students"], // TODO: verify
    capacity: 1000, // TODO: verify
    status: "confirmed",
    location: { lat: 17.9826, lng: 79.5287 }, // TODO: verify
  },
  {
    id: "priyadarshini",
    name: "Priyadarshini Mess",
    type: "mixed",
    menuStyle: "Mixed menu", // TODO: verify
    eligibleGroups: ["Ladies' Halls of Residence"], // TODO: verify
    capacity: 600, // TODO: verify
    status: "confirmed",
    location: { lat: 17.9818, lng: 79.5312 }, // TODO: verify
  },
  // Unconfirmed: exist per SPEC but names are not confirmed. Do not invent names.
  ...[5, 6, 7].map(
    (n, i): MessConfig => ({
      id: `mess-${n}`,
      name: `Mess ${n} (TODO)`,
      type: "mixed",
      menuStyle: "To be confirmed",
      eligibleGroups: ["To be confirmed"],
      capacity: 500, // TODO: verify
      status: "unconfirmed",
      location: {
        lat: 17.9838 + i * 0.0006, // TODO: verify
        lng: 79.5335 + i * 0.0004, // TODO: verify
      },
    }),
  ),
  ...[8, 9].map(
    (n, i): MessConfig => ({
      id: `mess-${n}`,
      name: `Mess ${n}, under construction (TODO)`,
      type: "mixed",
      menuStyle: "To be confirmed",
      eligibleGroups: ["To be confirmed"],
      capacity: 1000, // TODO: verify
      status: "under_construction",
      location: {
        lat: 17.9806 + i * 0.0007, // TODO: verify
        lng: 79.5278 + i * 0.0009, // TODO: verify
      },
    }),
  ),
];

export const confirmedMesses = messes.filter((m) => m.status === "confirmed");
export const CONFIRMED_COUNT = confirmedMesses.length;
