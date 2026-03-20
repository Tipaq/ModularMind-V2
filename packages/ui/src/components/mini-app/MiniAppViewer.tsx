"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2, RefreshCw } from "lucide-react";

interface MiniAppViewerProps {
  appId: string;
  appUrl: string;
  appName?: string;
  onClose: () => void;
}

function MiniAppViewer({ appId, appUrl, appName, onClose }: MiniAppViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [title, setTitle] = useState(appName || "Mini App");
  const [key, setKey] = useState(0);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.data || event.data.source !== "modularmind-sdk") return;

      const { type, data } = event.data;

      if (type === "ready") {
        iframeRef.current?.contentWindow?.postMessage(
          {
            source: "modularmind-parent",
            type: "initialized",
            data: {
              app: { id: appId, name: title },
              theme: document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
            },
          },
          "*",
        );
      }

      if (type === "set-title" && data?.title) {
        setTitle(data.title);
      }

      if (type === "toast" && data?.message) {
        console.info(`[MiniApp ${appId}] ${data.level || "info"}: ${data.message}`);
      }

      if (type === "chat-send" && data?.message) {
        console.info(`[MiniApp ${appId}] chat.send: ${data.message}`);
      }
    },
    [appId, title],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Observe theme changes on <html> and propagate to iframe
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: "modularmind-parent",
          type: "theme-changed",
          data: isDark ? "dark" : "light",
        },
        "*",
      );
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Build iframe URL with theme query param
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const themedUrl = appUrl + (appUrl.includes("?") ? "&" : "?") + `theme=${isDark ? "dark" : "light"}`;

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background flex flex-col"
    : "flex flex-col h-full border-l border-border w-[480px] shrink-0";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-sm font-medium truncate">{title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setKey((k) => k + 1)}
            className="p-1 rounded hover:bg-muted"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1 rounded hover:bg-muted"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
      <iframe
        key={key}
        ref={iframeRef}
        src={themedUrl}
        sandbox="allow-scripts allow-forms allow-same-origin"
        className="flex-1 w-full border-0"
        title={title}
      />
    </div>
  );
}

MiniAppViewer.displayName = "MiniAppViewer";
export { MiniAppViewer };
