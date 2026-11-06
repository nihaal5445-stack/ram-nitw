"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Menu, UtensilsCrossed, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { navGroups } from "@/config/site";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";

function Brand() {
  const t = useTranslations("Public.brand");
  return (
    <Link href="/" className="flex items-center gap-3" aria-label={t("home")}>
      <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <UtensilsCrossed className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-xl font-semibold tracking-tight text-brand">RAM</span>
        <span className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("tagline")}</span>
      </span>
    </Link>
  );
}

function SignInButton({ className }: { className?: string }) {
  const t = useTranslations("Public.nav");
  return (
    <Link
      href="/login"
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        className,
      )}
    >
      {t("signIn")}
    </Link>
  );
}

export function SiteHeader() {
  const t = useTranslations("Public.nav");
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function hoverOpen(key: string) {
    clearTimeout(timer.current);
    setOpen(key);
  }
  function hoverClose() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(null), 150);
  }

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm"
      onMouseLeave={hoverClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          const btn = headerRef.current?.querySelector<HTMLElement>(`[data-nav-trigger="${open}"]`);
          setOpen(null);
          btn?.focus();
        }
      }}
      onBlur={(e) => {
        if (!headerRef.current?.contains(e.relatedTarget as Node | null)) setOpen(null);
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Brand />

        <nav aria-label={t("primary")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {navGroups.map((g) => {
              const isOpen = open === g.key;
              return (
                <li key={g.key} onMouseEnter={() => hoverOpen(g.key)}>
                  <button
                    type="button"
                    data-nav-trigger={g.key}
                    aria-expanded={isOpen}
                    aria-controls={`mega-${g.key}`}
                    onClick={() => setOpen(isOpen ? null : g.key)}
                    className={cn(
                      "inline-flex h-16 items-center gap-1 border-b-2 px-3 text-sm font-medium transition-colors",
                      isOpen ? "border-primary text-brand" : "border-transparent text-foreground hover:text-brand",
                    )}
                  >
                    {t(`${g.key}.label`)}
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", isOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                  <div
                    id={`mega-${g.key}`}
                    hidden={!isOpen}
                    onMouseEnter={() => hoverOpen(g.key)}
                    className="absolute inset-x-0 top-full border-b border-border bg-surface shadow-lg"
                  >
                    <div className="mx-auto grid max-w-7xl grid-cols-12 gap-10 px-8 py-10">
                      <div className="col-span-4">
                        <p className="font-display text-2xl font-semibold text-brand">{t(`${g.key}.label`)}</p>
                        <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                          {t(`${g.key}.blurb`)}
                        </p>
                      </div>
                      <ul className="col-span-8 grid grid-cols-2 gap-x-8 gap-y-6">
                        {g.links.map((l) => (
                          <li key={l.key}>
                            <Link
                              href={l.href}
                              onClick={() => setOpen(null)}
                              className="group flex gap-4 rounded-md p-2 -m-2 hover:bg-surface-2"
                            >
                              <l.icon className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
                              <span>
                                <span className="block text-sm font-semibold group-hover:underline">
                                  {t(`${g.key}.links.${l.key}.title`)}
                                </span>
                                <span className="mt-1 block max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
                                  {t(`${g.key}.links.${l.key}.desc`)}
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <LocaleToggle />
            <ThemeToggle />
          </div>
          <SignInButton className="hidden sm:inline-flex" />
          <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
            <DialogPrimitive.Trigger
              className="inline-flex size-9 items-center justify-center rounded-md border border-border lg:hidden"
              aria-label={t("openMenu")}
            >
              <Menu className="size-5" aria-hidden />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
              <DialogPrimitive.Popup
                aria-label={t("menu")}
                className="fixed inset-y-0 right-0 z-[70] flex w-[min(22rem,100vw)] flex-col overflow-y-auto bg-background shadow-xl outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
              >
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
                  <DialogPrimitive.Title className="font-display text-lg font-semibold text-brand">
                    {t("menu")}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border"
                    aria-label={t("closeMenu")}
                  >
                    <X className="size-5" aria-hidden />
                  </DialogPrimitive.Close>
                </div>
                <nav aria-label={t("primary")} className="flex-1 px-4 py-4">
                  {navGroups.map((g) => (
                    <div key={g.key} className="border-b border-border py-4 last:border-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t(`${g.key}.label`)}
                      </p>
                      <ul className="mt-2">
                        {g.links.map((l) => (
                          <li key={l.key}>
                            <Link
                              href={l.href}
                              onClick={() => setDrawer(false)}
                              className="flex items-center gap-3 rounded-md py-2.5 text-[15px] hover:text-brand"
                            >
                              <l.icon className="size-4 text-brand" strokeWidth={1.75} aria-hidden />
                              {t(`${g.key}.links.${l.key}.title`)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
                <div className="flex shrink-0 items-center gap-2 border-t border-border p-4">
                  <LocaleToggle />
                  <ThemeToggle />
                  <SignInButton className="ml-auto" />
                </div>
              </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </div>
    </header>
  );
}
