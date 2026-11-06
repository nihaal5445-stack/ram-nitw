"use client";

import { Suspense, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChefHat, GraduationCap, MailCheck, UsersRound, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { authConfig } from "@/config/auth";
import { images } from "@/config/images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { cn } from "@/lib/utils";

type Audience = "students" | "parents" | "staff";
type Step = "form" | "sent" | "error";
const audiences: { key: Audience; icon: LucideIcon }[] = [
  { key: "students", icon: GraduationCap },
  { key: "parents", icon: UsersRound },
  { key: "staff", icon: ChefHat },
];
const isAudience = (v: string | null): v is Audience => v === "students" || v === "parents" || v === "staff";

function LoginInner() {
  const t = useTranslations("Login");
  const params = useSearchParams();
  const initial = params.get("role");
  const [audience, setAudience] = useState<Audience>(isAudience(initial) ? initial : "students");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>(params.get("error") ? "error" : "form");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(params.get("error") ? t("error") : "");
  const tabRefs = useRef<Record<Audience, HTMLButtonElement | null>>({ students: null, parents: null, staff: null });
  const supabase = createClient();

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = audiences[(i + dir + audiences.length) % audiences.length].key;
    setAudience(next);
    tabRefs.current[next]?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    if (audience === "students" && !email.trim().toLowerCase().endsWith(authConfig.studentDomain)) {
      setErrorMsg(t("domainError", { domain: authConfig.studentDomain }));
      setStep("error");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setErrorMsg(t("error"));
      setStep("error");
    } else {
      setStep("sent");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-navy-deep text-navy-deep-foreground lg:block">
        <Image src={images.hero.src} width={images.hero.width} height={images.hero.height} alt="" sizes="50vw"
          className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-deep via-navy-deep/80 to-navy-deep/40" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UtensilsCrossed className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="font-display text-2xl font-semibold">RAM</span>
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-on-dark">{t("eyebrow")}</p>
            <p className="mt-4 max-w-[18ch] font-display text-4xl font-semibold leading-tight">{t("panelTitle")}</p>
            <p className="mt-4 max-w-[44ch] leading-relaxed text-navy-deep-foreground/85">{t("panelLead")}</p>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex flex-col bg-surface text-foreground">
        <header className="flex items-center justify-between gap-2 p-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> {t("back")}
          </Link>
          <div className="flex gap-2"><LocaleToggle /><ThemeToggle /></div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <h1 className="font-display text-3xl font-semibold text-brand">{t("title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>

            <div role="tablist" aria-label={t("tablist")} className="mt-8 grid grid-cols-3 gap-1 rounded-lg border border-border bg-background p-1">
              {audiences.map((a, i) => (
                <button
                  key={a.key}
                  ref={(el) => { tabRefs.current[a.key] = el; }}
                  role="tab"
                  type="button"
                  id={`tab-${a.key}`}
                  aria-selected={audience === a.key}
                  aria-controls="login-panel"
                  tabIndex={audience === a.key ? 0 : -1}
                  onClick={() => { setAudience(a.key); setStep("form"); setErrorMsg(""); }}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md px-2 py-2.5 text-center text-xs font-medium leading-tight transition-colors",
                    audience === a.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <a.icon className="size-5" strokeWidth={1.75} aria-hidden />
                  {t(`tabs.${a.key}`)}
                </button>
              ))}
            </div>

            <div id="login-panel" role="tabpanel" aria-labelledby={`tab-${audience}`} className="mt-6 rounded-lg border border-border bg-background p-6">
              {step === "sent" ? (
                <div className="space-y-4 text-center">
                  <MailCheck className="mx-auto size-10 text-brand" strokeWidth={1.5} aria-hidden />
                  <h2 className="font-display text-xl font-semibold">{t("checkEmail")}</h2>
                  <p className="text-sm text-muted-foreground" role="status">{t("checkEmailDesc", { email })}</p>
                  <Button variant="outline" className="w-full" onClick={() => { setStep("form"); setEmail(""); }}>
                    {t("differentEmail")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div>
                    <h2 className="font-display text-xl font-semibold">{t(`${audience}.title`)}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`${audience}.desc`)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("emailLabel")}</Label>
                    <Input id="email" type="email" autoComplete="email" required className="h-11"
                      placeholder={t(`${audience}.placeholder`)} value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={step === "error"} aria-describedby="email-hint" />
                    <p id="email-hint" className="text-xs text-muted-foreground">{t(`${audience}.hint`)}</p>
                  </div>
                  {step === "error" && <p role="alert" className="text-sm text-destructive">{errorMsg}</p>}
                  <Button type="submit" disabled={loading || !email}
                    className="h-11 w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
                    {loading ? t("loading") : t("sendOtp")}
                  </Button>
                </form>
              )}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">{t("footer", { year: new Date().getFullYear() })}</p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
