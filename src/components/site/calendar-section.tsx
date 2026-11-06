import { getLocale, getTranslations } from "next-intl/server";
import { CalendarOff, UtensilsCrossed } from "lucide-react";
import { messes } from "@/config/messes";
import { calendarEvents } from "@/config/demo-data";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

export async function CalendarSection() {
  const t = await getTranslations("Public.calendar");
  const locale = await getLocale();
  // Today in IST as YYYY-MM-DD
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [year, month] = today.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay(); // Sunday-first
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + i))), // 1 Nov 2026 is a Sunday
  );
  const fmtLong = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const upcoming = calendarEvents.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const byDay = new Map<number, typeof calendarEvents>();
  for (const e of calendarEvents) {
    const [y, m, d] = e.date.split("-").map(Number);
    if (y === year && m === month) byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const nameOf = (id: string) => (id === "all" ? t("allMesses") : (messes.find((m) => m.id === id)?.name ?? id));
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <section id="calendar" aria-labelledby="calendar-title" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="calendar-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">{t("title")}</h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
          <p className="mt-3 inline-block rounded-full border border-border px-3 py-1 text-xs font-medium">{t("demo")}</p>
        </Reveal>

        <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <table className="w-full table-fixed border-collapse text-center">
              <caption className="pb-4 text-left font-display text-xl font-semibold">{monthName}</caption>
              <thead>
                <tr>{weekdays.map((d) => (
                  <th key={d} scope="col" className="pb-2 text-xs font-medium text-muted-foreground">{d}</th>
                ))}</tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.ceil(cells.length / 7) }, (_, r) => (
                  <tr key={r}>
                    {Array.from({ length: 7 }, (_, c) => {
                      const day = cells[r * 7 + c] ?? null;
                      const ev = day ? byDay.get(day) : undefined;
                      const kind = ev?.[0].type;
                      const isToday = day !== null && `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` === today;
                      return (
                        <td key={c} className="p-0.5">
                          {day !== null && (
                            <span
                              aria-label={ev ? `${fmtLong.format(new Date(Date.UTC(year, month - 1, day)))}: ${ev.map((e) => t(`type.${e.type}`)).join(", ")}` : undefined}
                              className={cn(
                                "mx-auto flex size-9 items-center justify-center rounded-md text-sm tabular-nums",
                                kind === "special" && "bg-primary font-semibold text-primary-foreground",
                                kind === "closure" && "border-2 border-dashed border-foreground font-semibold",
                                isToday && !kind && "ring-2 ring-brand",
                              )}
                            >
                              {day}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="inline-flex items-center gap-2"><span className="size-3.5 rounded-sm bg-primary" aria-hidden />{t("type.special")}</li>
              <li className="inline-flex items-center gap-2"><span className="size-3.5 rounded-sm border-2 border-dashed border-foreground" aria-hidden />{t("type.closure")}</li>
            </ul>
          </Reveal>

          <Reveal className="lg:col-span-7">
            <h3 className="font-display text-2xl font-semibold">{t("upcoming")}</h3>
            {upcoming.length === 0 ? (
              <p className="mt-4 text-muted-foreground">{t("none")}</p>
            ) : (
              <ol className="mt-4 divide-y divide-border border-y border-border">
                {upcoming.map((e) => {
                  const Icon = e.type === "special" ? UtensilsCrossed : CalendarOff;
                  return (
                    <li key={e.id} className="flex gap-4 py-5">
                      <Icon className={cn("mt-1 size-5 shrink-0", e.type === "special" ? "text-brand" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          <time dateTime={e.date}>{fmtLong.format(new Date(`${e.date}T00:00:00Z`))}</time> · {t(`type.${e.type}`)}
                        </p>
                        <p className="mt-1 text-lg leading-snug">{t(`items.${e.id}`)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{nameOf(e.messId)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
