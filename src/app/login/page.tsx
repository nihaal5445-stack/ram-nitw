"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/utils/supabase/client";
import { authConfig } from "@/config/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";

type Step = "form" | "sent" | "error";

export default function LoginPage() {
  const t = useTranslations("Login");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Minimal top bar */}
      <header className="flex justify-end gap-2 p-4">
        <LocaleToggle />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo + branding */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-heading font-bold shadow-lg">
              R
            </div>
            <h1 className="text-2xl font-heading font-bold text-primary">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>

          {step === "sent" ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3 shadow-sm">
              <div className="text-4xl">📬</div>
              <h2 className="font-semibold text-lg">{t("checkEmail")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("checkEmailDesc", { email })}
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep("form");
                  setEmail("");
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("studentNote")}
                  </p>
                </div>

                {step === "error" && (
                  <p className="text-sm text-destructive">{errorMsg}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  disabled={loading || !email}
                >
                  {loading ? t("loading") : t("sendOtp")}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Mess management platform · NIT Warangal · {new Date().getFullYear()}
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
