import { getTranslations } from "next-intl/server";
import { ExternalLink, Phone } from "lucide-react";
import { DemoBadge } from "@/components/demo-badge";

export async function UtilityBar() {
  const t = await getTranslations("Public.utility");
  return (
    <div className="bg-navy-deep text-navy-deep-foreground text-xs">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a
          href="https://www.nitw.ac.in"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <span className="truncate">{t("institute")}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">{t("opensNew")}</span>
        </a>
        <div className="flex items-center gap-5">
          <DemoBadge />
        </div>
        <div className="hidden items-center gap-5 sm:flex">
          <span>{t("confirmed")}</span>
          {/* TODO: verify helpline number */}
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-3" aria-hidden />
            {t("helpline")}
          </span>
        </div>
      </div>
    </div>
  );
}
