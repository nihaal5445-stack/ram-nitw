import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDemoMode } from "@/lib/demo-mode";

/** Small "Demo mode" badge: shown only while DEMO MODE is on (every time counts as an open meal slot). */
export async function DemoBadge({ className }: { className?: string }) {
  if (!(await getDemoMode())) return null;
  const t = await getTranslations("Demo");
  return (
    <span title={t("hint")} data-testid="demo-badge"
      className={`inline-flex items-center gap-1 rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[11px] font-semibold ${className ?? ""}`}>
      <FlaskConical className="size-3" aria-hidden />{t("badge")}
    </span>
  );
}
