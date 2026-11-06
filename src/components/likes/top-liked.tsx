import { getTranslations } from "next-intl/server";
import { Heart } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { messes } from "@/config/messes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Admin / warden: most-liked dishes over the last 7 days (aggregates only). */
export async function TopLiked({ showMess = false }: { showMess?: boolean }) {
  const t = await getTranslations("Likes");
  const td = await getTranslations("Public.dishes");
  const { data } = await (await createClient()).rpc("top_liked_dishes", { p_days: 7 });
  const rows = (data ?? []) as { mess_id: string; dish_key: string; n: number }[];
  return (
    <Card className="border border-border shadow-sm" data-testid="top-liked">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><Heart className="size-4 text-destructive" aria-hidden />{t("topTitle")}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("topNone")}</p> : (
          <ol className="space-y-1.5 text-sm">
            {rows.map((r, i) => (
              <li key={r.mess_id + r.dish_key} className="flex items-center justify-between">
                <span>{i + 1}. {td.has(r.dish_key) ? td(r.dish_key) : r.dish_key}{showMess ? ` · ${messes.find((m) => m.id === r.mess_id)?.name ?? r.mess_id}` : ""}</span>
                <span className="tabular-nums text-muted-foreground">{t("likes", { n: r.n })}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
