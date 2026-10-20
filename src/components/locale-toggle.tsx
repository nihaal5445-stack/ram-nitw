"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function LocaleToggle() {
  const router = useRouter();

  const setLocale = async (locale: "en" | "te" | "hi") => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
    
    // Save to user profile in Supabase if logged in
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ preferred_locale: locale })
          .eq("id", user.id);
      }
    } catch {
      // Ignore background persistence errors
    }

    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Toggle language">
            <Globe className="h-[1.2rem] w-[1.2rem]" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLocale("en")}>
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("te")}>
          తెలుగు
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("hi")}>
          हिन्दी
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
