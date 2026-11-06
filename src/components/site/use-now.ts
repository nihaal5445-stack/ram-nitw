"use client";
import { useEffect, useState } from "react";

/** Current time, ticking each 30s. `null` until mounted so server and client markup match. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
