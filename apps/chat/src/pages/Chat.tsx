import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bot,
  MessageCircle,
  Plus,
  Trash2,
  User,
  Zap,
  Loader2,
} from "lucide-react";
import { cn, relativeTime } from "@modularmind/ui";
import { useAuth } from "../hooks/useAuth";
import { useChat, type Message } from "../hooks/useChat";
import { ExecutionActivity } from "../components/ExecutionActivity";
import { ChatInput } from "../components/ChatInput";
import { api } from "../lib/api";

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  supervisor_mode: boolean;
  messages?: Message[];
}

interface ConversationListResponse {
  items: Conversation[];
  total: number;
}

export default function Chat() {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = searchParams.get("id");
  const setActiveConversation = useCallback(
    (id: string | null) => {
      if (id) {
        setSearchParams({ id });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

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

  // Load conversations
  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const data = await api.get<ConversationListResponse>("/conversations");
        setConversations(data.items || []);
      } catch {
        // Silently fail — user may not have conversations yet
      }
      setLoading(false);
    }
    load();
  }, [user]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversation) {
      setInitialMessages([]);
      return;
    }
    async function loadMessages() {
      try {
        const data = await api.get<Conversation>(`/conversations/${activeConversation}`);
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

  const handleNewConversation = async () => {
    try {
      const conv = await api.post<Conversation>("/conversations", {
        title: "New Chat",
        supervisor_mode: true,
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveConversation(conv.id);
    } catch {
      // Error creating conversation
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.delete(`/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation === id) {
        setActiveConversation(null);
      }
    } catch {
      // Error deleting
    }
    setDeleteTarget(null);
  };

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

    // Refresh conversation list for updated message counts
    try {
      const data = await api.get<ConversationListResponse>("/conversations");
      setConversations(data.items || []);
    } catch {
      // Silent
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeConv = conversations.find((c) => c.id === activeConversation);
  const activeTitle = activeConv?.title || "Chat";

  return (
    <div className="flex h-screen bg-background">
      {/* Conversations sidebar */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-card/50">
        <div className="p-3 border-b">
          <button
            onClick={handleNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveConversation(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveConversation(conv.id);
                    }
                  }}
                  className={cn(
                    "group w-full cursor-pointer rounded-lg p-3 text-left transition-colors",
                    activeConversation === conv.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.title || "Chat"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {conv.message_count} msgs &middot; {relativeTime(conv.updated_at)}
                      </p>
                    </div>
                    <button
                      className="shrink-0 opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conv.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeConversation ? (
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
        ) : (
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
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete conversation?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This conversation and all its messages will be permanently deleted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConversation(deleteTarget)}
                className="rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
