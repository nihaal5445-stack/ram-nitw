import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { roleDashboard } from "@/utils/supabase/get-current-profile";
import { SignOutButton } from "@/components/sign-out-button";
import type { Role } from "@/config/auth";

/** Shown instead of a silent redirect when a signed-in user opens a dashboard page that belongs to another role. */
export async function WrongRole({ role, expected }: { role: Role; expected: Role }) {
  const t = await getTranslations("WrongRole");
  const td = await getTranslations("Dashboard.role");
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border-2 border-warning bg-card p-6" role="alert" data-testid="wrong-role">
      <p className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5 text-warning" aria-hidden />{t("title", { role: td(role) })}</p>
      <p className="text-sm text-muted-foreground">{t("body", { expected: td(expected) })}</p>
      <div className="flex flex-wrap gap-2">
        <SignOutButton label={t("signOut")} />
        <Link href={roleDashboard[role]} className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">{t("mine")}</Link>
      </div>
    </div>
  );
}
