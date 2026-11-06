"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { mealSlots, type MealId } from "@/config/demo-data";
import { istWeekday, menuFor } from "@/config/weekly-menu";
import { slotState } from "@/lib/meal-time";
import { LikeHeart } from "@/components/likes/heart";
import { likeKey, useLikes } from "@/components/likes/use-likes";
import { useNow } from "./use-now";

function VegTag({ veg }: { veg: boolean }) {
  const t = useTranslations("MessMenu");
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className={cn("inline-flex size-3.5 items-center justify-center rounded-[3px] border-2", veg ? "border-success" : "border-destructive")} aria-hidden>
        <span className={cn("size-1.5 rounded-full", veg ? "bg-success" : "bg-destructive")} />
      </span>
      {veg ? t("veg") : t("nonVeg")}
    </span>
  );
}

/** Public mess section: today's full menu (tabs for the four meals, the current/next one open), veg tags, timings, live like counts. Demo data. */
export function FullMenuToday({ messId, vegOnly }: { messId: string; vegOnly: boolean }) {
  const t = useTranslations("MessMenu");
  const tm = useTranslations("Public.meals");
  const td = useTranslations("Public.dishes");
  const now = useNow();
  const { counts } = useLikes(messId);
  const [picked, setPicked] = useState<MealId | null>(null);
  const st = now ? slotState(now) : null;
  const active: MealId = picked ?? st?.slot.id ?? "breakfast";
  const day = now ? istWeekday(now, st?.tomorrow ? 1 : 0) : 1;
  const dishes = menuFor(active, day).filter((d) => !vegOnly || d.veg);
  const slot = mealSlots.find((s) => s.id === active)!;
  const statusOf = (id: MealId) => (st && st.slot.id === id ? (st.status === "serving" ? "now" : "next") : null);

  return (
    <section aria-labelledby={`fm-${messId}`} className="rounded-lg border border-border bg-card p-4" data-testid={`full-menu-${messId}`}>
      <div className="flex items-center justify-between gap-2"><h4 id={`fm-${messId}`} className="font-display text-xl font-semibold">{st?.tomorrow ? t("tomorrowTitle") : t("title")}</h4><span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground" title={t("demo")}>{t("demoTag")}</span></div>
      <div role="tablist" aria-label={t("tabs")} className="mt-3 grid grid-cols-4 gap-1 rounded-md bg-muted p-1 text-sm">
        {mealSlots.map((s) => {
          const mark = statusOf(s.id);
          return (
            <button key={s.id} role="tab" type="button" aria-selected={active === s.id} onClick={() => setPicked(s.id)} data-testid={`fm-tab-${s.id}`} data-status={mark ?? undefined}
              className={cn("relative rounded px-1 py-1.5 text-center font-medium", active === s.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {tm(s.id)}
              {mark && <span className={cn("absolute right-1 top-1 size-1.5 rounded-full", mark === "now" ? "bg-success" : "bg-gold")} aria-hidden />}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="mt-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="tabular-nums text-muted-foreground">{slot.start} – {slot.end}</span>
          {statusOf(active) && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusOf(active) === "now" ? "bg-success text-white" : "bg-primary text-primary-foreground")}>{t(statusOf(active) === "now" ? "nowServing" : "nextUp")}</span>}
        </div>
        <ul className="mt-2 min-h-[10rem] divide-y divide-border text-sm" data-testid="fm-dishes">
          {dishes.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-2 py-1">
              <span className="flex flex-wrap items-center gap-x-2">{td(d.key)} <VegTag veg={d.veg} /></span>
              <LikeHeart count={counts[likeKey(active, d.key)] ?? 0} liked={false} label={t("likes", { n: counts[likeKey(active, d.key)] ?? 0 })} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Right column: only the meal being served now (or next), as compact chips. The full day is in the card on the left. */
export function NowServing({ vegOnly }: { vegOnly: boolean }) {
  const t = useTranslations("MessMenu");
  const tm = useTranslations("Public.meals");
  const td = useTranslations("Public.dishes");
  const now = useNow();
  const st = now ? slotState(now) : null;
  if (!st || !now) return <div className="h-28 animate-pulse rounded-lg bg-muted" aria-hidden />;
  const dishes = menuFor(st.slot.id, istWeekday(now, st.tomorrow ? 1 : 0)).filter((d) => !vegOnly || d.veg);
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="now-serving">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{st.status === "serving" ? t("nowServing") : st.tomorrow ? t("tomorrowLabel") : t("nextUp")}: {tm(st.slot.id)}</h4>
        <span className="text-xs tabular-nums text-muted-foreground">{st.slot.start} – {st.slot.end}</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {dishes.map((d) => (
          <li key={d.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm">
            <span className={cn("size-2 rounded-full", d.veg ? "bg-success" : "bg-destructive")} aria-hidden />{td(d.key)}<span className="sr-only"> ({d.veg ? t("veg") : t("nonVeg")})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
