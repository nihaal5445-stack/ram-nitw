"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const handleToggle = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);

    // Save to user profile in Supabase if logged in
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ preferred_theme: nextTheme })
          .eq("id", user.id);
      }
    } catch {
      // Ignore background persistence errors
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleToggle}
      aria-label="Toggle theme"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
