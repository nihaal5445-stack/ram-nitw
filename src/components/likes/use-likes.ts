"use client";
import { useCallback, useEffect, useState } from "react";

export const likeKey = (slot: string, dish: string) => `${slot}:${dish}`;

/** Today's like counts for a mess (public API, polled every 20 s). With `mine`, also the student's own likes and a toggle. */
export function useLikes(messId: string, mine = false) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(`/api/likes?mess=${messId}`, { cache: "no-store" });
      if (r.ok) setCounts(Object.fromEntries(((await r.json()) as { counts: { slot: string; dish_key: string; n: number }[] }).counts.map((c) => [likeKey(c.slot, c.dish_key), c.n])));
    } catch { /* offline: keep the last numbers */ }
    if (mine) {
      const { createClient } = await import("@/utils/supabase/client");
      const { data } = await createClient().rpc("my_dish_likes");
      if (data) setLiked(new Set((data as { slot: string; dish_key: string }[]).map((d) => likeKey(d.slot, d.dish_key))));
    }
  }, [messId, mine]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), 20_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);

  const toggle = useCallback(async (slot: string, dish: string) => {
    const k = likeKey(slot, dish);
    const was = liked.has(k);
    setLiked((s) => { const n = new Set(s); if (was) n.delete(k); else n.add(k); return n; }); // optimistic
    setCounts((c) => ({ ...c, [k]: Math.max(0, (c[k] ?? 0) + (was ? -1 : 1)) }));
    const { createClient } = await import("@/utils/supabase/client");
    const { error } = await createClient().rpc("toggle_dish_like", { p_slot: slot, p_dish: dish });
    if (error) void load(); // roll back to the server's truth
  }, [liked, load]);

  return { counts, liked, toggle };
}
