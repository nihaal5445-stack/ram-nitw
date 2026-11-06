"use client";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/** A heart with a count. Interactive for students, read-only (just the count) otherwise. */
export function LikeHeart({ count, liked, onToggle, label }: { count: number; liked: boolean; onToggle?: () => void; label: string }) {
  const icon = <Heart className={cn("size-4", liked ? "fill-destructive text-destructive" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />;
  if (!onToggle) return <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground" aria-label={`${label}: ${count}`}>{icon}{count}</span>;
  return (
    <button type="button" onClick={onToggle} aria-pressed={liked} aria-label={label} data-testid="like-btn"
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums hover:bg-muted">
      {icon}<span data-testid="like-count">{count}</span>
    </button>
  );
}
