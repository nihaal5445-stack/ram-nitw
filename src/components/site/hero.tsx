import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { images } from "@/config/images";
import { CrowdPill } from "./crowd-pill";
import { TodaysMenuCard } from "./todays-menu-card";

export async function Hero() {
  const t = await getTranslations("Public.hero");
  return (
    <section id="hero" className="relative isolate overflow-hidden bg-navy-deep text-navy-deep-foreground">
      <Image
        src={images.hero.src}
        width={images.hero.width}
        height={images.hero.height}
        alt={images.hero.alt}
        loading="eager"
        fetchPriority="high"
        sizes="100vw"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-deep/95 via-navy-deep/80 to-navy-deep/65 lg:via-navy-deep/65 lg:to-navy-deep/10" aria-hidden />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:py-24">
        <div className="lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-on-dark">{t("eyebrow")}</p>
          <h1 className="mt-4 max-w-[16ch] font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-navy-deep-foreground/85">{t("lead")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/#messes" className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {t("ctaMesses")} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/#map" className="inline-flex h-11 items-center rounded-md border border-navy-deep-foreground/40 px-5 text-sm font-medium hover:bg-navy-deep-foreground/10">
              {t("ctaMap")}
            </Link>
          </div>
          <CrowdPill className="mt-8" />
        </div>
        <div className="lg:col-span-5">
          <TodaysMenuCard />
        </div>
      </div>
    </section>
  );
}
