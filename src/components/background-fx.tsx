"use client";

import { useEffect } from "react";

/**
 * Page backdrop: a faint paper grain everywhere, a soft maroon-gold glow in light mode, and a slow aurora in dark mode.
 * All CSS (see .fx-* in globals.css): transform-only animation on three pre-rendered gradients, no blur filters, no blend modes.
 * The animation pauses under prefers-reduced-motion (CSS) and while the tab is hidden (the class toggled here).
 */
export function BackgroundFx() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle("fx-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <div className="fx-layer" aria-hidden data-testid="bg-fx">
      <div className="fx-light-glow" />
      <div className="fx-aurora">
        <span className="fx-blob fx-blob-a" />
        <span className="fx-blob fx-blob-b" />
        <span className="fx-blob fx-blob-c" />
      </div>
      <div className="fx-grain" />
    </div>
  );
}
