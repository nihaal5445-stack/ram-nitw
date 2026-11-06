"use client";
import { useTranslations } from "next-intl";
import { Users, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { crowdHint, type CrowdRow } from "@/lib/crowd";
import { useCrowd } from "./use-crowd";

const bar = { low: "bg-success", moderate: "bg-warning", busy: "bg-destructive", closed: "bg-muted-foreground/40" } as const;

export function CrowdBar({ row, name }: { row: CrowdRow | undefined; name: string }) {
  const t = useTranslations("Crowd");
  if (!row) return <div className="h-14 animate-pulse rounded-md bg-muted" aria-hidden />;
  const hint = crowdHint(row, name);
  const width = row.level === "closed" ? 0 : Math.min(100, row.pct);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{t(`level.${row.level}`)}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{row.level === "closed" ? "" : `${row.pct}%`}</span>
      </div>
      <div
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, row.pct)}
        aria-label={`${t("now")}: ${name}`} className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted-foreground/20"
      >
        <div className={cn("h-full rounded-full transition-all duration-700", bar[row.level])} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t("scans", { n: row.scans_10m })}{row.includes_demo ? ` · ${t("demo")}` : ""}
      </p>
      {hint && (
        <p className="mt-2 flex items-start gap-1.5 text-sm" role="status">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />
          {hint.after ? t("hintAfter", { name: hint.name, pct: hint.pct, time: hint.after }) : t("hintBusy", { name: hint.name, pct: hint.pct })}
        </p>
      )}
    </div>
  );
}

/** Public "Crowd now" meter for one mess. */
export function CrowdNow({ messId, name }: { messId: string; name: string }) {
  const t = useTranslations("Crowd");
  const crowd = useCrowd();
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Users className="size-3.5" aria-hidden /> {t("now")}
      </h4>
      <div className="mt-3"><CrowdBar row={crowd?.[messId]} name={name} /></div>
    </div>
  );
}
