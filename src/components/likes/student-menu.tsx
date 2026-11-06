"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { mealSlots, type MealId } from "@/config/demo-data";
import { istWeekday, menuFor, WEEKDAYS } from "@/config/weekly-menu";
import { slotState, toMin, istMinutes } from "@/lib/meal-time";
import { useNow } from "@/components/site/use-now";
import { LikeHeart } from "./heart";
import { likeKey, useLikes } from "./use-likes";

function VegTag({ veg }: { veg: boolean }) {
  const t = useTranslations("StudentMenu");
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={veg ? t("veg") : t("nonVeg")}>
      <span className={cn("inline-flex size-3.5 items-center justify-center rounded-[3px] border-2", veg ? "border-success" : "border-destructive")} aria-hidden>
        <span className={cn("size-1.5 rounded-full", veg ? "bg-success" : "bg-destructive")} />
      </span>
      {veg ? t("veg") : t("nonVeg")}
    </span>
  );
}

/** Student dashboard: today's full menu (all 4 meals, current/next highlighted, veg tags, like hearts) and the 7-day menu. Demo data. */
export function StudentMenu({ messId, vegOnly }: { messId: string; vegOnly: boolean }) {
  const t = useTranslations("StudentMenu");
  const tm = useTranslations("Public.meals");
  const td = useTranslations("Public.dishes");
  const tl = useTranslations("Likes");
  const now = useNow();
  const { counts, liked, toggle, unlocked } = useLikes(messId, true);
  const [tab, setTab] = useState<"today" | "week">("today");
  if (!now) return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-hidden />;

  const st = slotState(now);
  const day = istWeekday(now);
  const minutes = istMinutes(now);
  const status = (id: MealId, start: string, end: string) =>
    st.status === "serving" && st.slot.id === id ? "now" : minutes >= toMin(end) ? "done" : !st.tomorrow && st.status === "next" && st.slot.id === id ? "next" : "later";

  return (
    <section aria-labelledby="menu-title" className="space-y-4 rounded-lg border border-border bg-card p-4" data-testid="student-menu">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="menu-title" className="font-semibold">{t("title")}</h2>
        <div role="tablist" aria-label={t("title")} className="inline-flex rounded-md border border-border p-0.5 text-sm">
          {(["today", "week"] as const).map((k) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`menu-tab-${k}`}
              className={cn("rounded px-3 py-1", tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{t(k === "today" ? "tabToday" : "tabWeek")}</button>
          ))}
        </div>
      </div>

      {tab === "today" ? (
        <div className="grid gap-3 sm:grid-cols-2" role="tabpanel">
          {mealSlots.map((m) => {
            const s = status(m.id, m.start, m.end);
            const dishes = menuFor(m.id, day).filter((x) => !vegOnly || x.veg);
            return (
              <article key={m.id} data-testid={`meal-${m.id}`} data-status={s} aria-current={s === "now" || s === "next" ? "true" : undefined}
                className={cn("rounded-lg border p-3", s === "now" ? "border-2 border-success bg-success/5" : s === "next" ? "border-2 border-primary/50 bg-primary/5" : "border-border", s === "done" && "opacity-70")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{tm(m.id)} <span className="text-xs font-normal text-muted-foreground">{m.start}–{m.end}</span></h3>
                  <span className="flex items-center gap-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s === "now" ? "bg-success text-white" : s === "next" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {t(s === "now" ? "nowServing" : s === "next" ? "nextUp" : s === "done" ? "finished" : "later")}
                    </span>
                    <LikeHeart count={counts[likeKey(m.id, "_meal")] ?? 0} liked={liked.has(likeKey(m.id, "_meal"))} onToggle={() => toggle(m.id, "_meal")} label={tl("likeMeal")} lockedHint={unlocked.has(m.id) ? undefined : tl("locked")} />
                  </span>
                </div>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {dishes.map((x) => (
                    <li key={x.key} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="flex flex-wrap items-center gap-x-2">{td(x.key)} <VegTag veg={x.veg} /></span>
                      <LikeHeart count={counts[likeKey(m.id, x.key)] ?? 0} liked={liked.has(likeKey(m.id, x.key))} onToggle={() => toggle(m.id, x.key)} label={tl("likeDish", { dish: td(x.key) })} lockedHint={unlocked.has(m.id) ? undefined : tl("locked")} />
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto" role="tabpanel" data-testid="week-menu">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t("weekTitle")}</caption>
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-2">&nbsp;</th>{mealSlots.map((m) => <th key={m.id} className="py-2 pr-2">{tm(m.id)}</th>)}</tr></thead>
            <tbody className="divide-y divide-border align-top">
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                <tr key={wd} className={cn(wd === day && "bg-primary/5")} data-today={wd === day ? "true" : undefined}>
                  <th scope="row" className="py-2 pr-2 text-left font-medium">{WEEKDAYS[wd]}{wd === day && <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{t("today")}</span>}</th>
                  {mealSlots.map((m) => (
                    <td key={m.id} className="py-2 pr-2">
                      <ul className="space-y-0.5">
                        {menuFor(m.id, wd).filter((x) => !vegOnly || x.veg).map((x) => (
                          <li key={x.key} className="flex items-center gap-1.5">
                            <span className={cn("size-2 shrink-0 rounded-full", x.veg ? "bg-success" : "bg-destructive")} aria-hidden />
                            <span>{td(x.key)}{!x.veg && <span className="sr-only"> ({t("nonVeg")})</span>}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"><VegTag veg /> <VegTag veg={false} /></p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("demo")} {tab === "today" ? t("likeNote") : ""} {vegOnly ? t("pureVegNote") : ""}</p>
    </section>
  );
}
