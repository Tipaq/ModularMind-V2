"use client";

import { useEffect, useRef } from "react";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { Message } from "@/hooks/useChat";
import type { ExecutionActivity } from "@/hooks/useExecutionActivities";
import { ExecutionActivityList } from "./ExecutionActivity";

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  activities: ExecutionActivity[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ChatMessages({ messages, isStreaming, activities }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activities]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">Send a message to start the conversation</p>
        </div>
      ) : (
      <div className="px-4 py-6 space-y-4">
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        const isLast = i === messages.length - 1;
        const isLastAssistant = !isUser && isLast;
        const metadata = msg.metadata || {};
        const durationMs = typeof metadata.duration_ms === "number" ? metadata.duration_ms : null;

        return (
          <div key={msg.id}>
            {/* Show activity stream above last assistant message */}
            {isLastAssistant && activities.length > 0 && (
              <div className="mb-3">
                <ExecutionActivityList
                  activities={activities}
                  isStreaming={isStreaming}
                  hasContent={!!msg.content}
                />
              </div>
            )}

            <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {msg.content ? (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                ) : isStreaming && isLastAssistant ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                ) : null}

                {/* Duration inside message bubble */}
                {!isUser && msg.content && durationMs != null && durationMs > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDuration(durationMs)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
      </div>
      )}
    </div>
  );
}
