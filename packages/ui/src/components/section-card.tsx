"use client";

import { cn } from "../lib/utils";

export interface SectionCardProps {
  icon: React.ElementType;
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: "flat" | "card";
}

const VARIANT_CLASSES: Record<string, string> = {
  flat: "px-4 py-3.5 space-y-2.5",
  card: "rounded-xl border border-border bg-card p-5 space-y-4",
};

export function SectionCard({
  icon: Icon,
  title,
  trailing,
  children,
  className,
  variant = "flat",
}: SectionCardProps) {
  return (
    <div className={cn(VARIANT_CLASSES[variant], className)}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </p>
        {trailing}
      </div>
      {children}
    </div>
  );
}
