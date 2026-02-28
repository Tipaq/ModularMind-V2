import { useEffect, useRef, useState } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import {
  Bot,
  MessageCircle,
  Plus,
  User,
  Zap,
  Loader2,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import { useChat, type Message } from "../hooks/useChat";
import { ExecutionActivity } from "../components/ExecutionActivity";
import { ChatInput } from "../components/ChatInput";
import { api } from "../lib/api";
import type { Conversation } from "../components/ChatSidebar";

interface ChatLayoutContext {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  refreshConversations: () => Promise<void>;
  handleNewConversation: () => Promise<void>;
}

export default function Chat() {
  const {
    conversations,
    setConversations,
    refreshConversations,
    handleNewConversation,
  } = useOutletContext<ChatLayoutContext>();
  const [searchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = searchParams.get("id");

  const {
    messages,
    isStreaming,
    error,
    tokenUsage,
    activities,
    sendMessage,
    setInitialMessages,
    cancelStream,
  } = useChat(activeConversation);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversation) {
      setInitialMessages([]);
      return;
    }
    async function loadMessages() {
      try {
        const data = await api.get<Conversation & { messages?: Message[] }>(
          `/conversations/${activeConversation}`,
        );
        setInitialMessages(data.messages || []);
      } catch {
        setInitialMessages([]);
      }
    }
    loadMessages();
  }, [activeConversation, setInitialMessages]);

  // Auto-scroll
  const messageCount = messages.length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;
    const content = inputValue.trim();
    setInputValue("");

    // Auto-title on first message
    const conv = conversations.find((c) => c.id === activeConversation);
    if (conv && (conv.title === "New Chat" || !conv.title) && messages.length === 0) {
      const title = content.length > 50 ? content.slice(0, 50) + "\u2026" : content;
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation ? { ...c, title } : c)),
      );
      api.patch(`/conversations/${activeConversation}`, { title }).catch(() => {});
    }

    await sendMessage(content);
    await refreshConversations();
  };

  const activeConv = conversations.find((c) => c.id === activeConversation);
  const activeTitle = activeConv?.title || "Chat";

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold">Start a conversation</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Ask anything. The supervisor will route your message to the right agent.
        </p>
        <button
          onClick={handleNewConversation}
          className="mt-6 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{activeTitle}</p>
            {isStreaming && (
              <p className="text-xs text-muted-foreground">
                {activities.find((a) => a.status === "running")?.label || "Thinking..."}
              </p>
            )}
          </div>
        </div>
        {tokenUsage && (
          <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            {tokenUsage.total} tokens
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-muted-foreground">Send a message to start</p>
          </div>
        )}

        {messages.map((msg) => {
          const isLastAssistant =
            msg.role === "assistant" && msg.id === messages[messages.length - 1]?.id;
          const showActivities =
            isLastAssistant && (isStreaming || activities.length > 0);

          return (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {msg.role !== "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="max-w-[70%] min-w-0">
                {showActivities && (
                  <div className="mb-2">
                    <ExecutionActivity
                      activities={activities}
                      isStreaming={isStreaming}
                      hasContent={!!msg.content}
                    />
                  </div>
                )}
                {(msg.content || !isLastAssistant) && (
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {msg.content || (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Thinking...
                        </span>
                      )}
                    </div>
                    {msg.metadata?.routing_strategy ? (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {String(msg.metadata.routing_strategy)}
                        {msg.metadata.delegated_to ? ` \u2192 ${String(msg.metadata.delegated_to)}` : ""}
                      </p>
                    ) : null}
                    {msg.metadata?.duration_ms != null && (
                      <p className="text-xs opacity-60 mt-1">
                        {Math.round(Number(msg.metadata.duration_ms) / 1000)}s
                      </p>
                    )}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <div className="flex justify-center">
            <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          </div>
        )}

        {messages.length > 0 && <div ref={messagesEndRef} />}
      </div>

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        isStreaming={isStreaming}
        onCancel={cancelStream}
      />
    </>
  );
}
