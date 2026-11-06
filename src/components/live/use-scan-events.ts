"use client";
import { useEffect, useRef } from "react";

/** Calls `onScan` (debounced 300 ms) whenever the database broadcasts an accepted scan on the public "crowd" channel. */
export function useScanEvents(onScan: () => void, enabled = true) {
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!enabled) return;
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { createClient } = await import("@/utils/supabase/client");
      if (stop) return;
      const db = createClient();
      const ch = db.channel("crowd", { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "scan" }, () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 300); })
        .subscribe();
      cleanup = () => { void db.removeChannel(ch); };
    })();
    return () => { stop = true; clearTimeout(timer); cleanup?.(); };
  }, [enabled]);
}
