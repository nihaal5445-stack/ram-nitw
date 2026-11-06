import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { messes } from "@/config/messes";
import { mealSlots, messDemo } from "@/config/demo-data";
import { messPhotos } from "@/config/images";
import { MessLive } from "./mess-live";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

const key = (id: string) => id.replace(/-/g, "_");

export async function MessSections() {
  const t = await getTranslations("Public.messSections");
  const ts = await getTranslations("Public.status");
  const tt = await getTranslations("Public.messType");
  const tm = await getTranslations("Public.meals");
  const locale = await getLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const confirmed = messes.filter((m) => m.status === "confirmed");
  const others = messes.filter((m) => m.status !== "confirmed");

  return (
    <section id="messes" aria-labelledby="messes-title" className="bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="messes-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
        </Reveal>

        <div className="mt-14 space-y-20">
          {confirmed.map((m, i) => {
            const demo = messDemo[m.id];
            const photo = messPhotos[m.id];
            return (
              <Reveal key={m.id}>
                <article id={`mess-${m.id}`} aria-labelledby={`mess-${m.id}-title`}
                  className="scroll-mt-24 rounded-lg p-1 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12">
                  <div className={cn("lg:col-span-5", i % 2 === 1 && "lg:order-2")}>
                    <Image src={photo.src} width={photo.width} height={photo.height} alt={photo.alt}
                      sizes="(min-width:1024px) 40vw, 100vw" className="aspect-[4/3] w-full rounded-lg object-cover" />
                    <p className="mt-2 text-xs text-muted-foreground">{t("photoNote")}</p>
                  </div>
                  <div className={cn("mt-8 lg:mt-0 lg:col-span-7", i % 2 === 1 && "lg:order-1")}>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 id={`mess-${m.id}-title`} className="font-display text-3xl font-semibold">{m.name}</h3>
                      <span className="rounded-full border border-border px-3 py-0.5 text-xs font-medium">{ts(m.status)}</span>
                    </div>

                    <dl className="mt-6 grid gap-x-8 gap-y-4 border-y border-border py-5 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("menuStyle")}</dt>
                        <dd className="mt-1">{tt(m.type)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("eligibilityLabel")}</dt>
                        <dd className="mt-1">{m.eligibility.map((e) => t(`eligibility.${e}`)).join(", ")}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("timings")}</dt>
                        <dd className="mt-1 space-y-0.5 text-sm">
                          {mealSlots.map((s) => (
                            <span key={s.id} className="flex justify-between gap-4 sm:max-w-[16rem]">
                              <span>{tm(s.id)}</span><span className="tabular-nums text-muted-foreground">{s.start} – {s.end}</span>
                            </span>
                          ))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("rating")}</dt>
                        <dd className="mt-1">
                          <span className="inline-flex items-center gap-0.5" role="img" aria-label={t("ratingValue", { value: demo.rating })}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={cn("size-4", n <= Math.round(demo.rating) ? "fill-gold text-gold" : "text-muted-foreground/50")} strokeWidth={1.5} aria-hidden />
                            ))}
                          </span>
                          <span className="ml-2 text-sm tabular-nums">{demo.rating.toFixed(1)}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{t("demo")}</span>
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-6">
                      <MessLive messId={m.id} vegOnly={m.type === "veg"} />
                    </div>

                    <div className="mt-6">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("addOns")}</h4>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {demo.addOns.map((a) => (
                          <li key={a} className="rounded-full bg-surface-2 px-3 py-1 text-sm">{t(`addOnItems.${a}`)}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 border-l-2 border-gold pl-4">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("latest")}</h4>
                      <p className="mt-1">{t(`updates.${key(m.id)}`)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{fmt.format(new Date(demo.updateDate))} · {t("demo")}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-20">
          <h3 className="font-display text-2xl font-semibold">{t("othersTitle")}</h3>
          <p className="mt-2 max-w-[60ch] text-muted-foreground">{t("othersLead")}</p>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {others.map((m) => (
              <li key={m.id} id={`mess-${m.id}`} className="scroll-mt-24 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-muted-foreground">{ts(m.status)} · {t("detailsTbc")}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
