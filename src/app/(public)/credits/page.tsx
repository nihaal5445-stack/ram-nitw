import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { images } from "@/config/images";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.credits");
  return { title: t("title") };
}

export default async function CreditsPage() {
  const t = await getTranslations("Public.credits");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold text-brand">{t("title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("intro")}</p>
      <ul className="mt-10 divide-y divide-border border-y border-border">
        {Object.entries(images).map(([key, img]) => (
          <li key={key} className="py-4">
            <p className="font-medium">{img.alt}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("photographer")}: {img.credit} ·{" "}
              <a className="text-brand underline underline-offset-2" href={img.source} rel="noopener noreferrer" target="_blank">
                {t("source")}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
