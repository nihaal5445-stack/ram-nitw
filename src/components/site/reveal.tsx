import type { ReactNode } from "react";

/**
 * Subtle fade + rise on scroll, done in CSS (see `.reveal` in globals.css).
 * Content is visible by default; the animation only applies where scroll-driven
 * animations are supported and prefers-reduced-motion is not set.
 */
export function Reveal({ children, className }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={`reveal ${className ?? ""}`}>{children}</div>;
}
