import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/utils/supabase/get-current-profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileError } from "@/components/profile-error";
import { WrongRole } from "@/components/wrong-role";
import { ExtrasShop, type ShopOrder } from "@/components/addons/extras-shop";
import { syncPaymentMode } from "@/app/actions/payments";
import { razorpayConfigured } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

export default async function StudentExtrasPage({ searchParams }: { searchParams: Promise<{ debug?: string }> }) {
  const { user, profile, error } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (!profile) return <ProfileError error={error} />;
  if (profile.role !== "student") return <WrongRole role={profile.role} expected="student" />;

  await syncPaymentMode();
  const supabase = await createClient();
  const [{ data: addons }, { data: orders }] = await Promise.all([
    supabase.from("addons").select("id, name, price_paise, stock_total, sold, veg, photo").eq("active", true).order("name"),
    supabase.from("extras_orders").select("id, created_at, amount_paise, payment_method, payment_ref, order_id, addon_purchases(id, status, addons(name))").order("created_at", { ascending: false }).limit(20),
  ]);
  const shopOrders: ShopOrder[] = (orders ?? []).map((o) => ({
    id: o.id, at: o.created_at, amountPaise: o.amount_paise, method: o.payment_method, ref: o.payment_ref, orderId: o.order_id,
    tickets: ((o.addon_purchases ?? []) as unknown as { id: string; status: "paid" | "redeemed"; addons: { name: string } | null }[]).map((k) => ({ id: k.id, name: k.addons?.name ?? "Extra", status: k.status })),
  }));
  return (
    <ExtrasShop
      items={(addons ?? []).map((a) => ({ id: a.id, name: a.name, pricePaise: a.price_paise, left: a.stock_total - a.sold, veg: a.veg, photo: a.photo ?? "grab-go" }))}
      orders={shopOrders} messAssigned={!!profile.assigned_mess_id} razorpay={razorpayConfigured()} debug={(await searchParams).debug === "1"}
    />
  );
}
