"use client";

import { useTranslations } from "next-intl";
import { Clock, Leaf } from "lucide-react";
import { baseMenu } from "@/config/demo-data";
import { slotState } from "@/lib/meal-time";
import { useNow } from "./use-now";
import { CrowdNow } from "./crowd-meter";

/** Time-aware parts of a mess: today's menu for the current/next slot and a crowd meter. */
export function MessLive({ messId, name, vegOnly }: { messId: string; name: string; vegOnly: boolean }) {
  const t = useTranslations("Public.messSections");
  const tm = useTranslations("Public.meals");
  const td = useTranslations("Public.dishes");
  const now = useNow();
  const st = now ? slotState(now) : null;
  const dishes = st ? baseMenu[st.slot.id].filter((d) => !vegOnly || d.veg) : [];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("today")}</h4>
        <p className="mt-1 min-h-5 text-sm">
          {st ? `${st.status === "serving" ? t("serving") : st.tomorrow ? t("tomorrow") : t("next")}: ${tm(st.slot.id)}` : " "}
        </p>
        <ul className="mt-2 min-h-[8.5rem] divide-y divide-border border-y border-border text-sm">
          {dishes.map((d) => (
            <li key={d.key} className="flex items-center justify-between py-2">
              {td(d.key)}
              {d.veg && <Leaf className="size-3.5 text-success" strokeWidth={1.75} aria-label={t("veg")} />}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <CrowdNow messId={messId} name={name} />
        {st && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" strokeWidth={1.75} aria-hidden />
            {st.slot.start} – {st.slot.end}
          </p>
        )}
      </div>
    </div>
  );
}
