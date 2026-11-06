"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ArrowDown } from "lucide-react";
import { messes, type MessStatus } from "@/config/messes";
import { cn } from "@/lib/utils";

const CampusMap = dynamic(() => import("./campus-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-2" aria-hidden />,
});

const statusDot: Record<MessStatus, string> = {
  confirmed: "bg-success",
  unconfirmed: "bg-warning",
  under_construction: "bg-muted-foreground",
};

export function highlightAndScroll(id: string) {
  const target = document.getElementById(`mess-${id}`);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  target.classList.remove("mess-highlight");
  void target.offsetWidth; // restart the animation
  target.classList.add("mess-highlight");
  window.setTimeout(() => target.classList.remove("mess-highlight"), 1800);
}

export function MessMapSection() {
  const t = useTranslations("Public.map");
  const ts = useTranslations("Public.status");
  const tt = useTranslations("Public.messType");
  const [selected, setSelected] = useState<string | null>(null);

  const labels = Object.fromEntries(messes.map((m) => [m.id, `${m.name}, ${ts(m.status)}`]));
  const onPinClick = useCallback((id: string) => {
    setSelected(id);
    highlightAndScroll(id);
  }, []);

  return (
    <section id="map" aria-labelledby="map-title" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="map-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
          <p className="mt-3 text-sm font-medium">{t("count")}</p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <div className="h-[22rem] overflow-hidden rounded-lg border border-border lg:col-span-8 lg:h-[34rem]">
            <CampusMap messes={messes} selectedId={selected} labels={labels} onPinClick={onPinClick} />
          </div>
          <ul className="max-h-[34rem] space-y-2 overflow-y-auto lg:col-span-4" aria-label={t("listLabel")}>
            {messes.map((m) => (
              <li key={m.id}>
                <div
                  className={cn(
                    "rounded-md border bg-card p-3 transition-colors",
                    selected === m.id ? "border-primary bg-surface" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={selected === m.id}
                    onClick={() => setSelected(m.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", statusDot[m.status])} aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium">{m.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {tt(m.type)} · {ts(m.status)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelected(m.id); highlightAndScroll(m.id); }}
                    className="mt-2 ml-5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    {t("details")} <ArrowDown className="size-3" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label={t("legend")}>
          {(["confirmed", "unconfirmed", "under_construction"] as MessStatus[]).map((s) => (
            <li key={s} className="inline-flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", statusDot[s])} aria-hidden />
              {ts(s)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("todo")}</p>
      </div>
    </section>
  );
}
