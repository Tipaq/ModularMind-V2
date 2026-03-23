"use client";

import { memo, useState } from "react";
import { MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";

export interface HumanPromptRequest {
  executionId: string;
  promptId: string;
  promptType: "confirm" | "select" | "multi_select";
  question: string;
  options: { label: string; value: string }[];
}

export interface PromptCardProps {
  prompt: HumanPromptRequest;
  onRespond: (executionId: string, promptId: string, response: string) => Promise<void>;
  responded?: boolean;
}

export const PromptCard = memo(function PromptCard({
  prompt,
  onRespond,
  responded,
}: PromptCardProps) {
  const [loading, setLoading] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  const handleRespond = async (value: string) => {
    setLoading(true);
    setSelectedValue(value);
    try {
      await onRespond(prompt.executionId, prompt.promptId, value);
    } finally {
      setLoading(false);
    }
  };

  if (responded || selectedValue) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span>{prompt.question}</span>
        </div>
        <p className="text-xs font-medium ml-5">
          {prompt.options.find((o) => o.value === selectedValue)?.label || selectedValue}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm font-medium">{prompt.question}</p>
      </div>

      <div className="flex flex-wrap gap-2 ml-6">
        {prompt.options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleRespond(option.value)}
            disabled={loading}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              "border border-border hover:border-primary hover:bg-primary/10",
              loading && "opacity-50 cursor-not-allowed",
            )}
          >
            {loading && selectedValue === option.value ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              option.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
});
