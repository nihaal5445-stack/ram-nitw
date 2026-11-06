"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell, Star } from "lucide-react";
import { usePathname } from "next/navigation";
import { useFeedbackPrompts } from "./use-feedback";

/** Notification bell (students only) and the in-app banner. Not a push notification. */
export function FeedbackBell() {
  const t = useTranslations("Feedback");
  const { prompts } = useFeedbackPrompts();
  return (
    <Link href="/dashboard/student/feedback" aria-label={t("bell", { n: prompts.length })} data-testid="feedback-bell"
      className="relative inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
      <Bell className="size-4" aria-hidden />
      {prompts.length > 0 && (
        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground" data-testid="feedback-count">{prompts.length}</span>
      )}
    </Link>
  );
}

export function FeedbackBanner() {
  const t = useTranslations("Feedback");
  const tm = useTranslations("Public.meals");
  const path = usePathname();
  const { prompts } = useFeedbackPrompts();
  if (prompts.length === 0 || path.startsWith("/dashboard/student/feedback")) return null;
  const p = prompts[0];
  return (
    <div role="status" data-testid="feedback-banner" className="border-b border-gold/40 bg-gold/15">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <p className="flex items-center gap-2 font-medium"><Star className="size-4 text-gold" aria-hidden />{t("banner", { meal: tm(p.slot as "lunch") })}</p>
        <Link href="/dashboard/student/feedback" className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{t("rateNow")}</Link>
      </div>
    </div>
  );
}
