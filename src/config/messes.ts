export type MessType = "veg" | "mixed" | "north_indian";
export type MessStatus = "operational" | "under_construction";

export interface MessConfig {
  id: string;
  name: string;
  type: MessType;
  menuStyle: string;
  eligibleGroups: string[];
  capacity: number;
  status: MessStatus;
  location: {
    lat: number;
    lng: number;
  };
}

export const messes: MessConfig[] = [
  {
    id: "ifc-a",
    name: "IFC-A",
    type: "veg",
    menuStyle: "Pure Vegetarian",
    eligibleGroups: ["First-year students", "Pure-vegetarian students"],
    capacity: 800, // TODO: verify
    status: "operational",
    location: {
      lat: 17.984, // TODO: verify
      lng: 79.530, // TODO: verify
    },
  },
  {
    id: "ifc-b",
    name: "IFC-B",
    type: "mixed",
    menuStyle: "South and North Indian mixed menu",
    eligibleGroups: ["All students"], // TODO: verify
    capacity: 800, // TODO: verify
    status: "operational",
    location: {
      lat: 17.985, // TODO: verify
      lng: 79.531, // TODO: verify
    },
  },
  {
    id: "krishna",
    name: "Krishna Mess",
    type: "north_indian",
    menuStyle: "North Indian menu",
    eligibleGroups: ["All students"], // TODO: verify
    capacity: 1000, // TODO: verify
    status: "operational",
    location: {
      lat: 17.983, // TODO: verify
      lng: 79.529, // TODO: verify
    },
  },
  {
    id: "priyadarshini",
    name: "Priyadarshini Mess",
    type: "mixed",
    menuStyle: "Mixed menu",
    eligibleGroups: ["Ladies' Halls of Residence"],
    capacity: 600, // TODO: verify
    status: "operational",
    location: {
      lat: 17.982, // TODO: verify
      lng: 79.528, // TODO: verify
    },
  },
  // 3 operational mess placeholders
  {
    id: "op-5",
    name: "Operational Mess 5",
    type: "mixed",
    menuStyle: "Mixed menu",
    eligibleGroups: ["All students"],
    capacity: 500, // TODO: verify
    status: "operational",
    location: {
      lat: 17.984, // TODO: verify
      lng: 79.530, // TODO: verify
    },
  },
  {
    id: "op-6",
    name: "Operational Mess 6",
    type: "mixed",
    menuStyle: "Mixed menu",
    eligibleGroups: ["All students"],
    capacity: 500, // TODO: verify
    status: "operational",
    location: {
      lat: 17.984, // TODO: verify
      lng: 79.530, // TODO: verify
    },
  },
  {
    id: "op-7",
    name: "Operational Mess 7",
    type: "mixed",
    menuStyle: "Mixed menu",
    eligibleGroups: ["All students"],
    capacity: 500, // TODO: verify
    status: "operational",
    location: {
      lat: 17.984, // TODO: verify
      lng: 79.530, // TODO: verify
    },
  },
  // 2 under-construction mess placeholders
  {
    id: "uc-1",
    name: "New Mega Mess",
    type: "mixed",
    menuStyle: "Mixed menu",
    eligibleGroups: ["All students"],
    capacity: 1500, // TODO: verify
    status: "under_construction",
    location: {
      lat: 17.986, // TODO: verify
      lng: 79.532, // TODO: verify
    },
  },
  {
    id: "uc-2",
    name: "New Block Mess",
    type: "mixed",
    menuStyle: "Mixed menu",
    eligibleGroups: ["All students"],
    capacity: 1000, // TODO: verify
    status: "under_construction",
    location: {
      lat: 17.987, // TODO: verify
      lng: 79.533, // TODO: verify
    },
  },
];
