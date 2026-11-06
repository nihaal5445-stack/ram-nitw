"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRightLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

export function SwitchToggle({ on, demo, issued, redeemed }: { on: boolean; demo: boolean; issued: number; redeemed: number }) {
  const t = useTranslations("Switch.warden");
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const flip = () => start(async () => {
    const next = !value;
    const { error } = await createClient().rpc("set_mess_switch", { p_on: next });
    if (!error) { setValue(next); router.refresh(); }
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4" data-testid="switch-toggle">
      <div>
        <p className="flex items-center gap-2 font-semibold"><ArrowRightLeft className="size-4 text-primary" aria-hidden />{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("desc")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("passes", { issued, redeemed })}</p>
      </div>
      <button type="button" role="switch" aria-checked={value || demo} disabled={pending || demo} onClick={flip}
        className={cn("inline-flex h-9 min-w-24 items-center justify-center rounded-full border px-4 text-sm font-semibold", value || demo ? "border-success bg-success/15 text-success" : "border-border bg-muted")}>
        {demo ? t("demoOn") : value ? t("on") : t("off")}
      </button>
    </div>
  );
}
