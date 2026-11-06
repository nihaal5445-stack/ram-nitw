import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, ChefHat, GraduationCap, UsersRound, type LucideIcon } from "lucide-react";
import { Reveal } from "./reveal";

const audiences: { key: "students" | "parents" | "staff"; icon: LucideIcon }[] = [
  { key: "students", icon: GraduationCap },
  { key: "parents", icon: UsersRound },
  { key: "staff", icon: ChefHat },
];

export async function AudienceTiles() {
  const t = await getTranslations("Public.audiences");
  return (
    <section id="audiences" aria-labelledby="audiences-title" className="bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8 lg:py-28">
        <Reveal className="lg:col-span-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("eyebrow")}</p>
          <h2 id="audiences-title" className="mt-4 font-display text-3xl font-semibold leading-tight text-brand sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-[42ch] leading-relaxed text-muted-foreground">{t("lead")}</p>
        </Reveal>
        <ul className="border-b border-border lg:col-span-8">
          {audiences.map((a, i) => (
            <li key={a.key} className="border-t border-border">
              <Reveal delay={i * 0.08}>
                <Link
                  href={`/login?role=${a.key}`}
                  className="group grid grid-cols-[auto_1fr_auto] items-start gap-5 py-7 transition-colors hover:bg-surface-2 sm:gap-8 sm:px-4"
                >
                  <a.icon className="mt-1 size-7 text-brand" strokeWidth={1.5} aria-hidden />
                  <span>
                    <span className="block font-display text-2xl font-semibold">{t(`${a.key}.title`)}</span>
                    <span className="mt-2 block max-w-[56ch] leading-relaxed text-muted-foreground">{t(`${a.key}.desc`)}</span>
                    <span className="mt-3 block text-sm font-medium text-brand underline-offset-4 group-hover:underline">
                      {t(`${a.key}.cta`)}
                    </span>
                  </span>
                  <ArrowUpRight className="mt-1 size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
