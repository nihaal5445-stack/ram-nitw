"use client";
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let snapshot = 0;
const tick = () => {
  snapshot = Math.floor(Date.now() / 30_000) * 30_000; // stable between ticks
  listeners.forEach((l) => l());
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    tick();
    timer = setInterval(tick, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) clearInterval(timer);
  };
}

/** Current time, ticking every 30s. `null` on the server and first paint so markup matches. */
export function useNow(): Date | null {
  const ts = useSyncExternalStore(subscribe, () => snapshot, () => 0);
  return ts ? new Date(ts) : null;
}
