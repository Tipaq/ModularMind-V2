"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../theme/useTheme";
import { cn } from "../lib/utils";
import type { ThemeMode } from "../theme/ThemeProvider";

const MODES: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

interface ThemeToggleProps {
  /** Show as segmented control (default) or dropdown */
  variant?: "segmented" | "icon";
  className?: string;
}

export function ThemeToggle({ variant = "segmented", className }: ThemeToggleProps) {
  const { mode, setMode, resolvedMode } = useTheme();

  if (variant === "icon") {
    const next: ThemeMode = resolvedMode === "dark" ? "light" : "dark";
    return (
      <button
        onClick={() => setMode(next)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
          className,
        )}
        aria-label={`Switch to ${next} mode`}
        suppressHydrationWarning
      >
        {resolvedMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <div className={cn("inline-flex gap-1 rounded-lg border border-border bg-muted/50 p-1", className)}>
      {MODES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            mode === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
          aria-label={label}
          suppressHydrationWarning
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
