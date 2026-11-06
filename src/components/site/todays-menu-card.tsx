"use client";
import { useTranslations } from "next-intl";
import { Clock, Leaf } from "lucide-react";
import { istWeekday, menuFor } from "@/config/weekly-menu";
import { slotState } from "@/lib/meal-time";
import { useNow } from "./use-now";
import { cn } from "@/lib/utils";

export function TodaysMenuCard({ className }: { className?: string }) {
  const t = useTranslations("Public.menuCard");
  const tm = useTranslations("Public.meals");
  const td = useTranslations("Public.dishes");
  const now = useNow();
  const st = now ? slotState(now) : null;
  const slot = st?.slot;

  return (
    <section aria-labelledby="menu-card-title" className={cn("rounded-lg border border-border bg-background p-6 text-foreground shadow-xl", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="menu-card-title" className="font-display text-2xl font-semibold text-brand">{t("title")}</h2>
          <p className="mt-1 min-h-5 text-sm text-muted-foreground">
            {st && slot ? `${st.status === "serving" ? t("serving") : st.tomorrow ? t("tomorrow") : t("next")}: ${tm(slot.id)}` : " "}
          </p>
        </div>
        {slot && (
          <p className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium">
            <Clock className="size-3.5" strokeWidth={1.75} aria-hidden />
            {slot.start} – {slot.end}
          </p>
        )}
      </div>
      {/* Fixed min height so the card never shifts when the time-based content mounts */}
      <ul className="mt-5 min-h-[10.5rem] divide-y divide-border border-y border-border">
        {(slot && now ? menuFor(slot.id, istWeekday(now, st?.tomorrow ? 1 : 0)) : []).map((d) => (
          <li key={d.key} className="flex items-center justify-between py-2.5 text-[15px]">
            <span>{td(d.key)}</span>
            {d.veg && <Leaf className="size-4 text-success" strokeWidth={1.75} aria-label={t("veg")} />}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">{t("note")}</p>
    </section>
  );
}
