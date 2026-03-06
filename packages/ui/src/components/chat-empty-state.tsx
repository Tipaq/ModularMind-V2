"use client";

import { Sparkles } from "lucide-react";

export interface ChatEmptyStateProps {
  title?: string;
  subtitle?: string;
  suggestions?: Array<{ label: string; prompt: string }>;
  onSuggestionClick?: (prompt: string) => void;
}

export function ChatEmptyState({
  title = "What can I help with?",
  subtitle = "Ask a question, brainstorm ideas, or get help with a task.",
  suggestions,
  onSuggestionClick,
}: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>

      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>

      <p className="text-sm text-muted-foreground text-center max-w-sm mb-8">
        {subtitle}
      </p>

      {suggestions && suggestions.length > 0 && onSuggestionClick && (
        <div className="flex flex-wrap gap-2 justify-center max-w-md">
          {suggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => onSuggestionClick(s.prompt)}
              className="px-4 py-2 rounded-full border border-border/60 bg-card hover:bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
