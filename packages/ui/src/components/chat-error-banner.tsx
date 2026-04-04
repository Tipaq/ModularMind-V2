"use client";

import { useCallback } from "react";
import { AlertTriangle, KeyRound, Clock, WifiOff, RefreshCw, X } from "lucide-react";
import type { ChatError } from "../types/chat";

interface ChatErrorBannerProps {
  error: ChatError | null;
  crudError: string | null;
  onDismiss: () => void;
  onRetry: () => void;
}

const ERROR_ICONS: Record<string, typeof AlertTriangle> = {
  auth_failed: KeyRound,
  permission_denied: KeyRound,
  rate_limited: Clock,
  timeout: Clock,
  connection_failed: WifiOff,
  provider_unavailable: WifiOff,
  mcp_connection_failed: WifiOff,
};

function ChatErrorBanner({ error, crudError, onDismiss, onRetry }: ChatErrorBannerProps) {

  const handleRetry = useCallback(() => {
    onDismiss();
    onRetry();
  }, [onDismiss, onRetry]);

  const message = error?.message ?? crudError;
  if (!message) return null;

  const Icon = (error?.errorCode && ERROR_ICONS[error.errorCode]) || AlertTriangle;
  const isRetryable = error?.isRetryable ?? false;

  return (
    <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b border-destructive/20 shrink-0 flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{message}</span>
      {isRetryable && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-destructive/10 hover:bg-destructive/20 transition-colors"
          onClick={handleRetry}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
      <button
        type="button"
        className="text-destructive/60 hover:text-destructive transition-colors"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

ChatErrorBanner.displayName = "ChatErrorBanner";

export { ChatErrorBanner };
