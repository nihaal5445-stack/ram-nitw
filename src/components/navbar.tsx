"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Role } from "@/config/auth";

interface NavbarProps {
  userName: string;
  role: Role;
}

export function Navbar({ userName, role }: NavbarProps) {
  const t = useTranslations();
  const tNav = useTranslations("Nav");
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground font-heading font-bold text-sm shadow">
              R
            </div>
            <span className="font-heading font-bold text-primary text-lg hidden sm:block">
              {tNav("appName")}
            </span>
            <Badge
              variant="secondary"
              className="hidden sm:inline-flex text-xs bg-secondary text-secondary-foreground"
            >
              {t(`Dashboard.role.${role}`)}
            </Badge>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden md:block truncate max-w-[180px]">
              {userName}
            </span>
            <LocaleToggle />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="text-xs"
            >
              {tNav("signOut")}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
