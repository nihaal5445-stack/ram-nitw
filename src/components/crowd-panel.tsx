"use client";
import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messes } from "@/config/messes";
import { CrowdBar } from "@/components/site/crowd-meter";
import { useCrowd } from "@/components/site/use-crowd";

/** Live crowd for every confirmed mess (dashboards). The viewer's own mess is listed first. */
export function CrowdPanel({ ownMessId }: { ownMessId?: string | null }) {
  const t = useTranslations("Crowd");
  const crowd = useCrowd();
  const list = messes.filter((m) => m.status === "confirmed").sort((a, b) => (a.id === ownMessId ? -1 : b.id === ownMessId ? 1 : 0));
  return (
    <Card className="border border-border shadow-sm" data-testid="crowd-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="size-4 text-primary" aria-hidden /> {t("adminTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("adminLead")}</p>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {list.map((m) => (
          <div key={m.id}>
            <p className="mb-1 text-sm font-semibold">{m.name}{m.id === ownMessId ? " ★" : ""}</p>
            <CrowdBar row={crowd?.[m.id]} name={m.name} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
