"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/** Warden-only (enforced again inside the SQL function resolve_fraud_flag). */
export async function resolveFlag(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id || note.length < 3) return;
  const supabase = await createClient();
  await supabase.rpc("resolve_fraud_flag", { p_flag: id, p_note: note });
  revalidatePath("/dashboard/warden/fraud");
}
