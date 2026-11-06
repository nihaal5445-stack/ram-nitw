import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Reveal } from "./reveal";
import { UpdatesList, loadPublicUpdates } from "./updates-list";

/** Home page "Updates": the latest public announcements (closures, special meals, timings). */
export async function UpdatesSection() {
  const t = await getTranslations("Notifications");
  const items = await loadPublicUpdates();
  return (
    <section id="updates" aria-labelledby="updates-title" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("publicEyebrow")}</p>
              <h2 id="updates-title" className="mt-3 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">{t("publicTitle")}</h2>
              <p className="mt-3 max-w-[56ch] text-muted-foreground">{t("publicLead")}</p>
            </div>
            <Link href="/updates" className="text-sm font-semibold text-brand underline" data-testid="updates-all">{t("seeAll")}</Link>
          </div>
          <div className="mt-8"><UpdatesList items={items.slice(0, 4)} /></div>
        </Reveal>
      </div>
    </section>
  );
}
