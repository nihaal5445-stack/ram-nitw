import { getTranslations } from "next-intl/server";
import { UtilityBar } from "@/components/site/utility-bar";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Public.nav");
  return (
    <>
      <a
        href="#main"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("skip")}
      </a>
      <UtilityBar />
      <SiteHeader />
      <main id="main" className="flex-1 bg-background">{children}</main>
      <SiteFooter />
    </>
  );
}
