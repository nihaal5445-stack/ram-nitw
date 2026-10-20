export const authConfig = {
  studentDomain: "@student.nitw.ac.in",
  roles: [
    "student",
    "parent",
    "counter_staff",
    "mess_rep",
    "mess_admin",
    "warden",
  ] as const,
};

export type Role = (typeof authConfig.roles)[number];
