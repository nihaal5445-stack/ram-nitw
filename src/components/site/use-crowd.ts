"use client";
import { useEffect, useState } from "react";
import type { CrowdRow } from "@/lib/crowd";

/** Polls the public /api/crowd every 15 s (paused while the tab is hidden). */
export function useCrowd(): Record<string, CrowdRow> | null {
  const [data, setData] = useState<Record<string, CrowdRow> | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/crowd", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { crowd: CrowdRow[] };
        if (!stop) setData(Object.fromEntries(j.crowd.map((r) => [r.mess_id, r])));
      } catch { /* offline: keep the last reading */ }
    };
    void load();
    const id = window.setInterval(load, 15000);
    const vis = () => void load();
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; window.clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return data;
}
