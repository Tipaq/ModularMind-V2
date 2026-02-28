"use client";

import { Palette } from "lucide-react";
import { ThemeCustomizer } from "./theme-customizer";

interface AppearanceCardProps {
  className?: string;
}

export function AppearanceCard({ className }: AppearanceCardProps) {
  return (
    <section className={className ?? "rounded-lg border bg-card p-4"}>
      <div className="mb-4 flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" />
        <h2 className="font-medium">Appearance</h2>
      </div>
      <ThemeCustomizer />
    </section>
  );
}
