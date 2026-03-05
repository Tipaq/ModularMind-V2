import { useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, cn } from "@modularmind/ui";
import { api } from "../../lib/api";
import { formatTokens, formatCost } from "@modularmind/ui";
import { Pagination } from "../shared/Pagination";
import type {
  AdminConversation,
  AdminConversationListResponse,
  AdminMessage,
  AdminConversationMessagesResponse,
} from "@modularmind/api-client";

interface ExpandedConversation {
  messages: AdminMessage[];
  loading: boolean;
}

export function UserConversationsTab({ userId }: { userId: string }) {
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, ExpandedConversation>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<AdminConversationListResponse>(
          `/admin/users/${userId}/conversations?page=${page}&page_size=20`,
        );
        setConversations(res.items);
        setTotal(res.total);
      } catch (err) {
        console.error("[UserConversations] fetch:", err);
        setConversations([]);
      }
      setLoading(false);
    })();
  }, [userId, page]);

  const toggleConversation = async (convId: string) => {
    if (expanded[convId]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[convId];
        return next;
      });
      return;
    }

    setExpanded((prev) => ({
      ...prev,
      [convId]: { messages: [], loading: true },
    }));

    try {
      const res = await api.get<AdminConversationMessagesResponse>(
        `/admin/users/${userId}/conversations/${convId}/messages`,
      );
      setExpanded((prev) => ({
        ...prev,
        [convId]: { messages: res.messages, loading: false },
      }));
    } catch (err) {
      console.error("[UserConversations] messages:", err);
      setExpanded((prev) => ({
        ...prev,
        [convId]: { messages: [], loading: false },
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No conversations yet.</p>
      </div>
    );
  }

  const pageCount = Math.ceil(total / 20);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total} conversation{total !== 1 ? "s" : ""}
      </p>

      {conversations.map((conv) => {
        const isExpanded = !!expanded[conv.id];
        return (
          <Card key={conv.id}>
            <button
              onClick={() => toggleConversation(conv.id)}
              className="w-full text-left"
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <CardTitle className="text-sm truncate">
                      {conv.title || "Untitled"}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>{conv.message_count} msgs</span>
                    <span>
                      {formatTokens(conv.tokens_prompt + conv.tokens_completion)} tokens
                    </span>
                    <span>{formatCost(conv.estimated_cost)}</span>
                    <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {conv.agent_id && (
                  <p className="text-xs text-muted-foreground mt-1 pl-6">
                    Agent: {conv.agent_id.slice(0, 8)}...
                  </p>
                )}
              </CardHeader>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 px-4 pb-4">
                {expanded[conv.id].loading ? (
                  <div className="flex items-center justify-center py-6">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : expanded[conv.id].messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No messages.</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {expanded[conv.id].messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "rounded-lg p-3 text-sm",
                          msg.role === "user"
                            ? "bg-primary/10 ml-8"
                            : msg.role === "assistant"
                              ? "bg-muted mr-8"
                              : "bg-muted/50 text-muted-foreground",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {msg.role}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      <Pagination page={page} totalPages={pageCount} total={total} onPageChange={setPage} />
    </div>
  );
}
