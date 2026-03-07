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
      className="h-8 w-8 flex items-center justify-center text-[#888] hover:text-[#1a1a1a] hover:bg-[#e8e8e0] transition-colors"
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (Ctrl/Cmd + Shift + L)`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
