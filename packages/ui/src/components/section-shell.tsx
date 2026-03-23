"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface SectionShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionShell({ sidebar, children, className }: SectionShellProps) {
  return (
    <div className={cn("flex flex-1 min-h-0 overflow-hidden", className)}>
      {sidebar && (
        <aside className="shrink-0 border-r border-border overflow-y-auto">
          {sidebar}
        </aside>
      )}
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
