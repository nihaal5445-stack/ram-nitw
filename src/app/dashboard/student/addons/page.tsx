import { redirect } from "next/navigation";

/** The add-ons page became the Extras shop. Old links keep working. */
export default async function StudentAddonsRedirect({ searchParams }: { searchParams: Promise<{ debug?: string }> }) {
  redirect((await searchParams).debug === "1" ? "/dashboard/student/extras?debug=1" : "/dashboard/student/extras");
}
