"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@modularmind/ui";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  badge,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border/50 bg-card/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <span className="text-sm font-semibold">{title}</span>
        {badge}
      </button>
      {open && <div className="border-t border-border/50 px-5 py-5">{children}</div>}
    </div>
  );
}
