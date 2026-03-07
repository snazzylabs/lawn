"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeToggle";

export function PublicThemeToggleButton() {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-8 w-8 items-center justify-center border-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (Ctrl/Cmd + Shift + L)`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
