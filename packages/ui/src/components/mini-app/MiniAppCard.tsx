"use client";

import { AppWindow, Globe, Users, User } from "lucide-react";

interface MiniAppCardProps {
  id: string;
  name: string;
  description: string;
  scope: string;
  icon?: string | null;
  version: number;
  agentId?: string | null;
  onClick?: (id: string) => void;
}

const SCOPE_CONFIG = {
  GLOBAL: { label: "Global", icon: Globe, className: "text-success" },
  GROUP: { label: "Group", icon: Users, className: "text-info" },
  PERSONAL: { label: "Personal", icon: User, className: "text-muted-foreground" },
} as const;

function MiniAppCard({
  id,
  name,
  description,
  scope,
  icon,
  version,
  onClick,
}: MiniAppCardProps) {
  const scopeConfig = SCOPE_CONFIG[scope as keyof typeof SCOPE_CONFIG] || SCOPE_CONFIG.PERSONAL;
  const ScopeIcon = scopeConfig.icon;

  return (
    <button
      onClick={() => onClick?.(id)}
      className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left w-full"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
            {icon ? (
              <span className="text-lg">{icon}</span>
            ) : (
              <AppWindow className="h-4 w-4" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium">{name}</h3>
            <p className="text-xs text-muted-foreground">v{version}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs ${scopeConfig.className}`}>
          <ScopeIcon className="h-3 w-3" />
          <span>{scopeConfig.label}</span>
        </div>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
      )}
    </button>
  );
}

MiniAppCard.displayName = "MiniAppCard";
export { MiniAppCard };
