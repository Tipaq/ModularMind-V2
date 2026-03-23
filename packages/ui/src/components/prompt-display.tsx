"use client";

import { FileText } from "lucide-react";
import { CopyButton } from "./copy-button";

export interface PromptDisplayProps {
  content: string | null;
  maxHeight?: string;
  emptyIcon?: React.ElementType;
  emptyLabel?: string;
}

export function PromptDisplay({
  content,
  maxHeight = "320px",
  emptyIcon: EmptyIcon = FileText,
  emptyLabel = "No system prompt configured",
}: PromptDisplayProps) {
  if (!content) {
    return (
      <div className="rounded-lg bg-muted/20 border border-dashed border-border/50 p-4 flex flex-col items-center gap-2">
        <EmptyIcon className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="group relative rounded-lg bg-muted/30 overflow-hidden">
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton content={content} />
      </div>
      <div className="overflow-y-auto p-2.5 pr-8" style={{ maxHeight }}>
        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed font-mono text-foreground/85">
          {content}
        </pre>
      </div>
    </div>
  );
}
