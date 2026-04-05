"use client";

import { Plus } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";

export interface NewConversationButtonProps {
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  collapsed?: boolean;
  className?: string;
}

export function NewConversationButton({
  onClick,
  variant = "primary",
  disabled,
  collapsed,
  className,
}: NewConversationButtonProps) {
  if (variant === "secondary") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm transition-colors hover:bg-muted/50 disabled:opacity-50",
          collapsed && "justify-center px-2",
          className,
        )}
      >
        <Plus className="h-4 w-4 shrink-0" />
        {!collapsed && <span>New conversation</span>}
      </button>
    );
  }

  return (
    <Button onClick={onClick} disabled={disabled} size="sm" className={cn("gap-2", className)}>
      <Plus className="h-4 w-4" />
      New conversation
    </Button>
  );
}
