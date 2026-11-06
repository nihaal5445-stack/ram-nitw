"use client";

import { useTranslations } from "next-intl";
import { Coffee, Cookie, MoonStar, Soup, type LucideIcon } from "lucide-react";
import { mealSlots, type MealId } from "@/config/demo-data";
import { istMinutes, slotState, toMin } from "@/lib/meal-time";
import { useNow } from "./use-now";
import { cn } from "@/lib/utils";

const icons: Record<MealId, LucideIcon> = { breakfast: Coffee, lunch: Soup, snacks: Cookie, dinner: MoonStar };

export function MealTimings() {
  const t = useTranslations("Public.timings");
  const tm = useTranslations("Public.meals");
  const now = useNow();
  const st = now ? slotState(now) : null;
  const mins = now ? istMinutes(now) : 0;

  const dur = (total: number) => {
    const h = Math.floor(total / 60), m = total % 60;
    return h > 0 ? t("hm", { h, m }) : t("m", { m });
  };

  const stateOf = (id: MealId, start: string, end: string): "done" | "serving" | "next" | "later" => {
    if (!st) return "later";
    if (st.status === "serving" && st.slot.id === id) return "serving";
    if (st.status === "next" && st.slot.id === id) return "next";
    return !st.tomorrow && mins >= toMin(end) && toMin(start) < mins ? "done" : "later";
  };

  const clock = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(now)
    : null;

  return (
    <section id="timings" aria-labelledby="timings-title" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="timings-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-5 min-h-12 max-w-[56ch] text-lg leading-relaxed" role="status">
            {st
              ? st.status === "serving"
                ? t("servingSummary", { meal: tm(st.slot.id), left: dur(st.minutes) })
                : st.tomorrow
                  ? t("nextTomorrow", { meal: tm(st.slot.id), time: st.slot.start, left: dur(st.minutes) })
                  : t("nextSummary", { meal: tm(st.slot.id), time: st.slot.start, left: dur(st.minutes) })
              : " "}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {clock ? t("campusTime", { time: clock }) : " "}
          </p>
        </div>

        <ol className="relative mt-12 grid gap-0 lg:grid-cols-4">
          <span className="absolute left-[1.15rem] top-2 bottom-2 w-px bg-border lg:inset-x-0 lg:left-0 lg:top-[1.15rem] lg:bottom-auto lg:h-px lg:w-auto" aria-hidden />
          {mealSlots.map((s) => {
            const state = stateOf(s.id, s.start, s.end);
            const Icon = icons[s.id];
            return (
              <li key={s.id} aria-current={state === "serving" ? "true" : undefined}
                className="relative flex gap-5 pb-10 last:pb-0 lg:block lg:pb-0 lg:pr-6">
                <span className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-background",
                  state === "serving" ? "border-success text-success" : state === "next" ? "border-primary text-brand" : "border-border text-muted-foreground",
                )}>
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                  {state === "serving" && (
                    <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-success motion-safe:animate-pulse" aria-hidden />
                  )}
                </span>
                <div className="lg:mt-5">
                  <h3 className={cn("font-display text-2xl font-semibold", state === "done" && "text-muted-foreground")}>{tm(s.id)}</h3>
                  <p className="mt-1 tabular-nums text-muted-foreground">{s.start} – {s.end}</p>
                  <p className={cn(
                    "mt-2 inline-block min-h-6 text-sm font-medium",
                    state === "serving" && "text-success",
                    state === "next" && "text-brand",
                    state === "done" && "text-muted-foreground",
                  )}>
                    {state === "serving" ? t("nowServing") : state === "next" ? t("nextUp") : state === "done" ? t("done") : " "}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-10 text-xs text-muted-foreground">{t("note")}</p>
      </div>
    </section>
  );
}
