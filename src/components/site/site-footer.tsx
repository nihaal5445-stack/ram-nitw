import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapPin, Phone, Mail, UtensilsCrossed } from "lucide-react";

const explore = [
  { key: "messes", href: "/#messes" },
  { key: "map", href: "/#map" },
  { key: "timings", href: "/#timings" },
  { key: "progress", href: "/#progress" },
  { key: "calendar", href: "/#calendar" },
] as const;
const access = [
  { key: "students", href: "/login?role=students" },
  { key: "parents", href: "/login?role=parents" },
  { key: "staff", href: "/login?role=staff" },
] as const;

export async function SiteFooter() {
  const t = await getTranslations("Public.footer");
  const year = new Date().getFullYear();
  const link = "inline-block py-1 text-sm text-navy-deep-foreground/80 underline-offset-4 hover:text-navy-deep-foreground hover:underline";
  const heading = "text-xs font-semibold uppercase tracking-[0.14em] text-gold-on-dark";

  return (
    <footer id="footer" className="bg-navy-deep text-navy-deep-foreground">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <p className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UtensilsCrossed className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="font-display text-2xl font-semibold">RAM</span>
          </p>
          <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-navy-deep-foreground/80">{t("blurb")}</p>
        </div>

        <nav aria-label={t("explore")} className="lg:col-span-2">
          <h2 className={heading}>{t("explore")}</h2>
          <ul className="mt-4 space-y-3">
            {explore.map((l) => (
              <li key={l.key}><Link href={l.href} className={link}>{t(`links.${l.key}`)}</Link></li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("access")} className="lg:col-span-2">
          <h2 className={heading}>{t("access")}</h2>
          <ul className="mt-4 space-y-3">
            {access.map((l) => (
              <li key={l.key}><Link href={l.href} className={link}>{t(`links.${l.key}`)}</Link></li>
            ))}
          </ul>
        </nav>

        <div className="lg:col-span-4">
          <h2 className={heading}>{t("contact")}</h2>
          <address className="mt-4 space-y-3 text-sm not-italic text-navy-deep-foreground/80">
            <p className="flex gap-3"><MapPin className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />{t("address")}</p>
            {/* TODO: verify phone and email with the Chief Warden's office */}
            <p className="flex gap-3"><Phone className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />{t("phone")}</p>
            <p className="flex gap-3"><Mail className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />{t("email")}</p>
          </address>
          <a href="https://www.nitw.ac.in" target="_blank" rel="noopener noreferrer" className={`${link} mt-4 inline-block`}>
            {t("institute")}<span className="sr-only"> {t("opensNew")}</span>
          </a>
        </div>
      </div>

      <div className="border-t border-navy-deep-foreground/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-navy-deep-foreground/75 sm:px-6 lg:px-8">
          <p>{t("copyright", { year })}</p>
          <p>{t("demoNote")}</p>
          <Link href="/credits" className="underline-offset-4 hover:underline">{t("links.credits")}</Link>
        </div>
      </div>
    </footer>
  );
}
