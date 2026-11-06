import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Eye, HeartPulse, Recycle, ScrollText, ShoppingBag, type LucideIcon } from "lucide-react";
import { images, type SiteImage } from "@/config/images";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

type Key = "paper" | "waste" | "grab" | "transparency" | "wellness";
const items: { key: Key; icon: LucideIcon; img: SiteImage; span: string; overlay: boolean }[] = [
  { key: "paper", icon: ScrollText, img: images.hallInterior, span: "lg:col-span-7", overlay: true },
  { key: "waste", icon: Recycle, img: images.freshProduce, span: "lg:col-span-5", overlay: true },
  { key: "grab", icon: ShoppingBag, img: images.grabGo, span: "lg:col-span-4", overlay: false },
  { key: "transparency", icon: Eye, img: images.diningHall, span: "lg:col-span-4", overlay: false },
  { key: "wellness", icon: HeartPulse, img: images.wellnessBowl, span: "lg:col-span-4", overlay: false },
];

export async function Initiatives() {
  const t = await getTranslations("Public.initiatives");
  return (
    <section id="initiatives" aria-labelledby="initiatives-title" className="bg-surface-2">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="initiatives-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
        </Reveal>

        <ul className="mt-12 grid gap-6 lg:grid-cols-12">
          {items.map((it) => (
            <li key={it.key} className={cn(it.span)}>
              <Reveal className="h-full">
                <article
                  className={cn(
                    "relative h-full overflow-hidden rounded-lg border border-border bg-background",
                    it.overlay ? "flex min-h-[22rem] items-end text-navy-deep-foreground" : "flex flex-col",
                  )}
                >
                  {it.overlay ? (
                    <>
                      <Image src={it.img.src} width={it.img.width} height={it.img.height} alt={it.img.alt}
                        sizes="(min-width:1024px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-navy-deep via-navy-deep/60 to-navy-deep/0" aria-hidden />
                      <div className="relative p-6 sm:p-8">
                        <it.icon className="size-6 text-gold-on-dark" strokeWidth={1.5} aria-hidden />
                        <h3 className="mt-3 font-display text-2xl font-semibold">{t(`${it.key}.title`)}</h3>
                        <p className="mt-2 max-w-[46ch] leading-relaxed text-navy-deep-foreground/90">{t(`${it.key}.desc`)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Image src={it.img.src} width={it.img.width} height={it.img.height} alt={it.img.alt}
                        sizes="(min-width:1024px) 33vw, 100vw" className="aspect-[3/2] w-full object-cover" />
                      <div className="p-6">
                        <it.icon className="size-5 text-brand" strokeWidth={1.5} aria-hidden />
                        <h3 className="mt-3 font-display text-xl font-semibold">{t(`${it.key}.title`)}</h3>
                        <p className="mt-2 leading-relaxed text-muted-foreground">{t(`${it.key}.desc`)}</p>
                      </div>
                    </>
                  )}
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
