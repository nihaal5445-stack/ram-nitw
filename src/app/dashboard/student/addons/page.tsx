import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { AddonShop } from "@/components/addons/addon-shop";

export const dynamic = "force-dynamic";

export default async function StudentAddonsPage({ searchParams }: { searchParams: Promise<{ debug?: string }> }) {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") return <WrongRole role={profile.role} expected="student" />;

  const supabase = await createClient();
  const [{ data: addons }, { data: purchases }] = await Promise.all([
    supabase.from("addons").select("id, name, price_paise, stock_total, sold, active").eq("active", true).order("name"),
    supabase.from("addon_purchases").select("id, meal_date, slot, amount_paise, payment_ref, status, created_at, addons(name)").order("created_at", { ascending: false }).limit(30),
  ]);

  return (
    <AddonShop
      addons={(addons ?? []).map((a) => ({ id: a.id, name: a.name, pricePaise: a.price_paise, left: a.stock_total - a.sold }))}
      purchases={(purchases ?? []).map((p) => ({
        id: p.id, name: (p.addons as unknown as { name: string } | null)?.name ?? "Add-on", date: p.meal_date, slot: p.slot,
        amountPaise: p.amount_paise, ref: p.payment_ref, status: p.status as "paid" | "redeemed", at: p.created_at,
      }))}
      messAssigned={!!profile.assigned_mess_id}
      debug={(await searchParams).debug === "1"}
    />
  );
}
