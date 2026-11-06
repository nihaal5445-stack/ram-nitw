"use client";
import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/** A heart with a count. Interactive for students, read-only (just the count) otherwise. `lockedHint` = shown but disabled with a tooltip. */
export function LikeHeart({ count, liked, onToggle, label, lockedHint }: { count: number; liked: boolean; onToggle?: () => void; label: string; lockedHint?: string }) {
  const [tip, setTip] = useState(false);
  const icon = <Heart className={cn("size-4", liked ? "fill-destructive text-destructive" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />;
  if (!onToggle) return <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground" aria-label={`${label}: ${count}`}>{icon}{count}</span>;
  if (lockedHint && !liked) {
    // aria-disabled (not `disabled`) so the tooltip still shows on hover, focus and tap
    return (
      <span className="group relative inline-flex" title={lockedHint}>
        <button type="button" aria-disabled="true" aria-label={`${label}. ${lockedHint}`} data-testid="like-btn" data-locked="true"
          onClick={() => { setTip(true); setTimeout(() => setTip(false), 2500); }}
          className="inline-flex cursor-not-allowed items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums opacity-60">
          {icon}<span data-testid="like-count">{count}</span>
        </button>
        <span role="tooltip" data-testid="like-tooltip"
          className={cn("pointer-events-none absolute bottom-full right-0 z-20 mb-1 w-max max-w-[14rem] rounded-md bg-foreground px-2 py-1 text-[11px] text-background shadow group-hover:block group-focus-within:block", tip ? "block" : "hidden")}>{lockedHint}</span>
      </span>
    );
  }
  return (
    <button type="button" onClick={onToggle} aria-pressed={liked} aria-label={label} data-testid="like-btn"
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums hover:bg-muted">
      {icon}<span data-testid="like-count">{count}</span>
    </button>
  );
}
