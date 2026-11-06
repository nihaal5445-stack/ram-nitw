import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { WrongRole } from "@/components/wrong-role";
import { ProfileError } from "@/components/profile-error";
import { AddonAdmin } from "@/components/addons/addon-admin";

export const dynamic = "force-dynamic";

export default async function AdminAddonsPage() {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "mess_admin") return <WrongRole role={profile.role} expected="mess_admin" />;

  const supabase = await createClient();
  const [{ data: addons }, { data: purchases }] = await Promise.all([
    supabase.from("addons").select("id, name, price_paise, stock_total, sold, active").order("created_at"),
    supabase.from("addon_purchases").select("addon_id, status"),
  ]);
  const served = new Map<string, number>();
  for (const p of purchases ?? []) if (p.status === "redeemed") served.set(p.addon_id, (served.get(p.addon_id) ?? 0) + 1);

  return (
    <AddonAdmin rows={(addons ?? []).map((a) => ({
      id: a.id, name: a.name, price: a.price_paise / 100, stock: a.stock_total, sold: a.sold, served: served.get(a.id) ?? 0, active: a.active,
    }))} />
  );
}
