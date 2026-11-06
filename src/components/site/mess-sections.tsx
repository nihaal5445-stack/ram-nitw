import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Heart, Star } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { messes } from "@/config/messes";
import { mealSlots, messDemo } from "@/config/demo-data";
import { messPhotos } from "@/config/images";
import { FullMenuToday, NowServing } from "./full-menu-today";
import { CrowdNow } from "./crowd-meter";
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
  const tg = await getTranslations("MessMenu");
  const td = await getTranslations("Public.dishes");
  // anonymous-safe aggregates (items on sale, most-liked dishes); the section still renders with demo values if the database is unreachable
  let addonRows: { mess_id: string; name: string; price_paise: number; veg: boolean; in_stock: boolean }[] = [];
  let likedRows: { mess_id: string; dish_key: string; n: number }[] = [];
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const [a, l] = await Promise.all([db.rpc("public_addons"), db.rpc("public_top_liked")]);
    addonRows = a.data ?? []; likedRows = l.data ?? [];
  } catch { /* demo values below */ }
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
            const real = likedRows.filter((r) => r.mess_id === m.id);
            const likedIsDemo = real.length < 3;
            const topLiked = likedIsDemo ? demo.topLiked : real.map((r) => ({ dish: r.dish_key, n: r.n }));
            const myAddons = addonRows.filter((r) => r.mess_id === m.id);
            const fromReal = myAddons.length > 0;
            const fromPrice = fromReal ? Math.min(...myAddons.map((r) => r.price_paise)) / 100 : demo.addOnFrom;
            return (
              <Reveal key={m.id}>
                <article id={`mess-${m.id}`} aria-labelledby={`mess-${m.id}-title`}
                  className="scroll-mt-24 rounded-lg p-1 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12">
                  <div className={cn("space-y-4 lg:sticky lg:top-28 lg:col-span-5 lg:self-start", i % 2 === 1 && "lg:order-2")} data-testid={`mess-left-${m.id}`}>
                    <div>
                      <Image src={photo.src} width={photo.width} height={photo.height} alt={photo.alt}
                        sizes="(min-width:1024px) 40vw, 100vw" className="aspect-[16/10] w-full rounded-lg object-cover lg:aspect-[21/9]" />
                      <p className="mt-2 text-xs text-muted-foreground">{t("photoNote")}</p>
                    </div>

                    <FullMenuToday messId={m.id} vegOnly={m.type === "veg"} />

                    <div className="rounded-lg border border-border bg-card p-4" data-testid={`most-liked-${m.id}`}>
                      <h4 className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><Heart className="size-3.5 text-destructive" aria-hidden />{tg("mostLiked")}{likedIsDemo && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] normal-case tracking-normal" title={tg("mostLikedDemo")}>{tg("demoTag")}</span>}</h4>
                      <ol className="mt-2 grid grid-cols-3 gap-2 text-sm">
                        {topLiked.map((x, n) => (
                          <li key={x.dish} className="rounded-md bg-surface-2 px-2.5 py-2">
                            <span className="block truncate font-medium">{n + 1}. {td(x.dish)}</span>
                            <span className="mt-0.5 inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"><Heart className="size-3 fill-destructive text-destructive" aria-hidden />{x.n}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card text-sm" data-testid={`glance-${m.id}`} aria-label={tg("glance")}>
                      <div className="p-3"><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tg("capacity")}</dt><dd className="mt-1 font-medium">{tg("seats", { n: m.capacity })} <span className="text-xs font-normal text-muted-foreground">{tg("demoTag")}</span></dd></div>
                      <div className="p-3"><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tg("addOnsFrom")}</dt><dd className="mt-1 font-medium">Rs {fromPrice}{!fromReal && <span className="ml-1 text-xs font-normal text-muted-foreground">{tg("demoTag")}</span>}</dd></div>
                      <div className="p-3"><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tg("rating")}</dt><dd className="mt-1 font-medium">{demo.rating.toFixed(1)} / 5 <span className="text-xs font-normal text-muted-foreground">{tg("demoTag")}</span></dd></div>
                    </dl>
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

                    <div className="mt-6"><NowServing vegOnly={m.type === "veg"} /></div>

                    <div className="mt-4 rounded-lg border border-border bg-card p-4">
                      <CrowdNow messId={m.id} name={m.name} />
                    </div>

                    <div className="mt-6">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{fromReal ? tg("addOnsTitle") : t("addOns")}</h4>
                      {fromReal ? (
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid={`addons-${m.id}`}>
                          {myAddons.map((a) => (
                            <li key={a.name} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                              <span className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", a.veg ? "bg-success" : "bg-destructive")} aria-hidden />{a.name}<span className="sr-only"> ({a.veg ? tg("veg") : tg("nonVeg")})</span></span>
                              <span className="tabular-nums text-muted-foreground">Rs {a.price_paise / 100}{!a.in_stock && ` · ${tg("soldOut")}`}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {demo.addOns.map((a) => (<li key={a} className="rounded-full bg-surface-2 px-3 py-1 text-sm">{t(`addOnItems.${a}`)}</li>))}
                        </ul>
                      )}
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
