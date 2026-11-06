"use client";

import { useTranslations } from "next-intl";
import { Leaf } from "lucide-react";
import { baseMenu } from "@/config/demo-data";
import { slotState } from "@/lib/meal-time";
import { useNow } from "@/components/site/use-now";
import { LikeHeart } from "./heart";
import { likeKey, useLikes } from "./use-likes";

/** Today's menu for the student's mess with a heart per dish and one for the whole meal. */
export function StudentMenu({ messId, vegOnly }: { messId: string; vegOnly: boolean }) {
  const t = useTranslations("Likes");
  const tm = useTranslations("Public.meals");
  const td = useTranslations("Public.dishes");
  const now = useNow();
  const { counts, liked, toggle } = useLikes(messId, true);
  const st = now ? slotState(now) : null;
  if (!st) return <div className="h-40 animate-pulse rounded-lg bg-muted" aria-hidden />;
  const slot = st.slot.id;
  const dishes = baseMenu[slot].filter((d) => !vegOnly || d.veg);
  return (
    <section aria-labelledby="menu-likes" className="space-y-3 rounded-lg border border-border bg-card p-4" data-testid="student-menu">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="menu-likes" className="font-semibold">{t("title", { meal: tm(slot) })}</h2>
        <span className="flex items-center gap-1 text-sm">{t("wholeMeal")}
          <LikeHeart count={counts[likeKey(slot, "_meal")] ?? 0} liked={liked.has(likeKey(slot, "_meal"))} onToggle={() => toggle(slot, "_meal")} label={t("likeMeal")} /></span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {dishes.map((d) => (
          <li key={d.key} className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2">{td(d.key)}{d.veg && <Leaf className="size-3.5 text-success" aria-hidden />}</span>
            <LikeHeart count={counts[likeKey(slot, d.key)] ?? 0} liked={liked.has(likeKey(slot, d.key))} onToggle={() => toggle(slot, d.key)} label={t("likeDish", { dish: td(d.key) })} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </section>
  );
}
