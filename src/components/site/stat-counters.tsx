"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CONFIRMED_COUNT } from "@/config/messes";
import { stats } from "@/config/demo-data";

function Counter({ target, decimals }: { target: number; decimals: number }) {
  const locale = useLocale();
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(target); // final value by default (SSR, no-JS, reduced motion)

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let done = false;
    const io = new IntersectionObserver(([entry]) => {
      if (done) return;
      if (!entry.isIntersecting) { setValue(0); return; } // armed while off-screen
      done = true;
      io.disconnect();
      const start = performance.now();
      const dur = 1400;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        setValue(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);

  return (
    <span ref={ref} className="tabular-nums">
      {new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)}
    </span>
  );
}

export function StatCounters() {
  const t = useTranslations("Public.stats");
  const items = [
    { id: "messes", value: CONFIRMED_COUNT, decimals: 0, demo: false },
    ...stats,
  ];
  return (
    <section id="stats" aria-labelledby="stats-title" className="bg-navy-deep text-navy-deep-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="stats-title" className="font-display text-3xl font-semibold sm:text-4xl">{t("title")}</h2>
          <p className="rounded-full border border-navy-deep-foreground/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em]">
            {t("demoBadge")}
          </p>
        </div>
        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-navy-deep-foreground/20 lg:grid-cols-4">
          {items.map((s) => (
            <div key={s.id} className="bg-navy-deep p-6 sm:p-8">
              <dd className="order-first font-display text-4xl font-semibold text-gold-on-dark sm:text-5xl">
                <Counter target={s.value} decimals={s.decimals} />
              </dd>
              <dt className="mt-2 text-sm leading-snug text-navy-deep-foreground/85">
                {t(`${s.id}.label`)}
                {s.demo && <span className="block text-xs text-navy-deep-foreground/70">{t("demo")}</span>}
              </dt>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-[70ch] text-xs text-navy-deep-foreground/70">{t("note")}</p>
      </div>
    </section>
  );
}
