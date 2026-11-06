import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, Loader } from "lucide-react";
import { messes } from "@/config/messes";
import { progress } from "@/config/demo-data";
import { Reveal } from "./reveal";
import { createClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

export async function ProgressBoard() {
  const t = await getTranslations("Public.progress");
  const locale = await getLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  let posted: { mess_id: string; on_date: string; text: string }[] = [];
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    posted = (await db.rpc("public_progress")).data ?? [];
  } catch { /* the board still shows the demo entries */ }
  const nameOf = (id: string) => (id === "all" ? t("allMesses") : (messes.find((m) => m.id === id)?.name ?? id));

  return (
    <section id="progress" aria-labelledby="progress-title" className="bg-surface">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8 lg:py-28">
        <Reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
            <h2 id="progress-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-5 max-w-[42ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
            <p className="mt-4 inline-block rounded-full border border-border px-3 py-1 text-xs font-medium">{t("demo")}</p>
          </div>
        </Reveal>
        <Reveal className="lg:col-span-8">
          <ol className="border-t border-border">
            {posted.map((p, i) => (
              <li key={`db-${i}`} className="grid grid-cols-[4.5rem_1fr] gap-4 border-b border-border py-5 sm:grid-cols-[6rem_1fr_auto] sm:gap-8" data-testid="posted-progress">
                <time dateTime={p.on_date} className="font-display text-lg font-semibold tabular-nums text-brand">{fmt.format(new Date(p.on_date))}</time>
                <div>
                  <p className="max-w-[60ch] leading-relaxed">{p.text}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{nameOf(p.mess_id)}</p>
                </div>
                <p className="col-start-2 inline-flex items-center gap-1.5 self-start text-sm font-medium text-success sm:col-start-auto">
                  <CheckCircle2 className="size-4" strokeWidth={1.75} aria-hidden />{t("done")}
                </p>
              </li>
            ))}
            {progress.map((p) => (
              <li key={p.id} className="grid grid-cols-[4.5rem_1fr] gap-4 border-b border-border py-5 sm:grid-cols-[6rem_1fr_auto] sm:gap-8">
                <time dateTime={p.date} className="font-display text-lg font-semibold tabular-nums text-brand">
                  {fmt.format(new Date(p.date))}
                </time>
                <div>
                  <p className="max-w-[60ch] leading-relaxed">{t(`items.${p.id}`)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{nameOf(p.messId)}</p>
                </div>
                <p className={cn(
                  "col-start-2 inline-flex items-center gap-1.5 self-start text-sm font-medium sm:col-start-auto",
                  p.status === "done" ? "text-success" : "text-warning",
                )}>
                  {p.status === "done"
                    ? <CheckCircle2 className="size-4" strokeWidth={1.75} aria-hidden />
                    : <Loader className="size-4" strokeWidth={1.75} aria-hidden />}
                  {t(p.status)}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
