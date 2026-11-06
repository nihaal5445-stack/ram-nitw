import { getTranslations } from "next-intl/server";
import { FeeCharts } from "@/components/fees/fee-charts";

export async function generateMetadata() {
  const t = await getTranslations("Fees");
  return { title: t("title") };
}

export default async function FeesPage() {
  const t = await getTranslations("Fees");
  return (
    <section aria-labelledby="fees-title" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
        <h1 id="fees-title" className="mt-4 font-display text-4xl font-semibold leading-tight text-brand">{t("title")}</h1>
        <p className="mt-5 max-w-[60ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
        <p className="mt-6 inline-block rounded-md border border-warning bg-warning/15 px-3 py-2 text-sm font-medium" data-testid="fees-demo-banner">{t("demoBanner")}</p>
        <div className="mt-12"><FeeCharts /></div>
        <p className="mt-10 text-sm text-muted-foreground">{t("note")}</p>
      </div>
    </section>
  );
}
