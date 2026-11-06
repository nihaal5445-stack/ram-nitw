import { getTranslations } from "next-intl/server";
import { Quote } from "lucide-react";
import { Reveal } from "./reveal";
import { WardenPortrait } from "./warden-portrait";

export async function WelcomeCard() {
  const t = await getTranslations("Public.welcome");
  return (
    <section id="welcome" aria-labelledby="welcome-title" className="bg-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8 lg:py-28">
        <Reveal className="mx-auto w-full max-w-sm lg:col-span-5 lg:max-w-none">
          <figure>
            <div className="mx-auto aspect-[5/6] w-full max-w-sm overflow-hidden rounded-t-[999px] border border-border">
              <WardenPortrait label={t("portraitAlt")} />
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">{t("placeholder")}</figcaption>
          </figure>
        </Reveal>
        <Reveal className="lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="welcome-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
            {t("title")}
          </h2>
          <Quote className="mt-8 size-8 text-gold" strokeWidth={1.5} aria-hidden />
          <div className="mt-4 max-w-[62ch] space-y-5 text-lg leading-relaxed">
            <p>{t("p1")}</p>
            <p>{t("p2")}</p>
            <p>{t("p3")}</p>
          </div>
          <p className="mt-8 font-display text-xl font-semibold">{t("name")}</p>
          <p className="text-sm text-muted-foreground">{t("role")}</p>
        </Reveal>
      </div>
    </section>
  );
}
