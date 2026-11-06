"use client";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { crowdFor } from "@/lib/meal-time";
import { useNow } from "./use-now";
import { cn } from "@/lib/utils";

const dot = { low: "bg-success", moderate: "bg-warning", busy: "bg-destructive" } as const;

export function CrowdPill({ className }: { className?: string }) {
  const t = useTranslations("Public.crowd");
  const now = useNow();
  const level = now ? crowdFor(now) : null;
  return (
    <p
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-foreground shadow-sm",
        className,
      )}
    >
      <Users className="size-4 text-brand" strokeWidth={1.75} aria-hidden />
      <span className="font-medium">{t("label")}</span>
      {level && <span className={cn("size-2 rounded-full", dot[level])} aria-hidden />}
      <span role="status">{now ? (level ? t(level) : t("closed")) : " "}</span>
      <span className="text-xs text-muted-foreground">· {t("demo")}</span>
    </p>
  );
}
