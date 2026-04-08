"use client";

import { useState, useRef, useCallback, useLayoutEffect, memo } from "react";
import { Send } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";

const MAX_TEXTAREA_HEIGHT = 120;

export interface QuickChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const QuickChatInput = memo(function QuickChatInput({
  onSend,
  placeholder = "Start a new conversation...",
  disabled = false,
  className,
}: QuickChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const sh = el.scrollHeight;
    el.style.height = `${Math.min(sh, MAX_TEXTAREA_HEIGHT)}px`;
    el.style.overflowY = sh > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className={cn("relative flex flex-col rounded-xl border bg-muted transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50", className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="resize-none bg-transparent px-4 pt-3 pb-2 text-sm focus:outline-none min-h-[44px]"
        rows={1}
      />
      <div className="flex items-center justify-end px-2 pb-2 pt-0.5">
        <Button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
