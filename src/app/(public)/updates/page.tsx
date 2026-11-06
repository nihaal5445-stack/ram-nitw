import { getTranslations } from "next-intl/server";
import { UpdatesList, loadPublicUpdates } from "@/components/site/updates-list";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Notifications");
  return { title: t("publicTitle") };
}

export default async function UpdatesPage() {
  const t = await getTranslations("Notifications");
  const items = await loadPublicUpdates();
  return (
    <section aria-labelledby="updates-page-title" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("publicEyebrow")}</p>
        <h1 id="updates-page-title" className="mt-4 font-display text-4xl font-semibold leading-tight text-brand">{t("publicTitle")}</h1>
        <p className="mt-5 max-w-[60ch] leading-relaxed text-muted-foreground">{t("publicLead")}</p>
        <div className="mt-10"><UpdatesList items={items} /></div>
        <p className="mt-8 text-sm text-muted-foreground">{t("publicNote")}</p>
      </div>
    </section>
  );
}
