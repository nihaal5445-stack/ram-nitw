import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@supabase/supabase-js";
import { CATEGORY_ICON, type Category } from "@/components/notifications/categories";
import { messes } from "@/config/messes";

export interface PublicUpdate { id: string; title: string; body: string; category: Category; mess_ids: string[]; pinned: boolean; created_at: string }

/** Anonymous-safe: only closures, special meals and timings that staff marked public (never complaints or anything personal). */
export async function loadPublicUpdates(): Promise<PublicUpdate[]> {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    return ((await db.rpc("public_announcements")).data ?? []) as PublicUpdate[];
  } catch { return []; }
}

export async function UpdatesList({ items }: { items: PublicUpdate[] }) {
  const t = await getTranslations("Notifications");
  const tc = await getTranslations("Notifications.categories");
  const locale = await getLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const known = messes.filter((m) => m.status === "confirmed");
  const where = (ids: string[]) => (known.every((m) => ids.includes(m.id)) ? t("allMessesLabel") : ids.map((id) => messes.find((m) => m.id === id)?.name ?? id).join(", "));
  if (items.length === 0) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground" data-testid="updates-empty">{t("publicNone")}</p>;
  return (
    <ul className="grid gap-4 md:grid-cols-2" data-testid="updates-list">
      {items.map((u) => {
        const Icon = CATEGORY_ICON[u.category] ?? CATEGORY_ICON.general;
        return (
          <li key={u.id} data-testid="update-item" data-category={u.category} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="size-4 text-primary" aria-hidden />{tc(u.category)}
              {u.pinned && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-foreground">{t("pinned")}</span>}
              <time dateTime={u.created_at} className="ml-auto font-normal normal-case tracking-normal">{fmt.format(new Date(u.created_at))}</time>
            </div>
            <h3 className="mt-2 font-semibold">{u.title}</h3>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{u.body}</p>
            <p className="mt-3 text-xs font-medium">{where(u.mess_ids)}</p>
          </li>
        );
      })}
    </ul>
  );
}
