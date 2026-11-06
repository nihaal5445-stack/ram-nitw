"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { createClient } from "@/utils/supabase/client";
import { useScanEvents } from "./use-scan-events";

// the icon is passed by NAME: server components cannot hand a component function to a client component
const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Today's accepted-scan head count (RLS scopes it to the viewer's mess), updated live when a scanner syncs. */
export function LiveCount({ initial, title, icon, accent, description }: { initial: number; title: string; icon: "users" | "check"; accent?: "primary" | "secondary" | "green" | "amber"; description?: string }) {
  const [n, setN] = useState(initial);
  const refresh = useCallback(async () => {
    const { count } = await createClient().from("meal_redemptions").select("id", { count: "exact", head: true }).eq("status", "accepted").eq("meal_date", todayIst());
    if (typeof count === "number") setN(count);
  }, []);
  useScanEvents(refresh);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) void refresh(); }, 30_000); return () => clearInterval(id); }, [refresh]); // fallback if the socket drops
  return <div data-testid="live-count" data-count={n}><StatCard title={title} value={String(n)} icon={icon === "users" ? Users : CheckCircle} accent={accent} description={description} /></div>;
}
