import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ChatSidebar, type Conversation } from "../components/ChatSidebar";
import { api } from "../lib/api";

interface ConversationListResponse {
  items: Conversation[];
  total: number;
}

export default function ChatLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const data = await api.get<ConversationListResponse>("/conversations");
        setConversations(data.items || []);
      } catch {
        // Silently fail
      }
      setLoading(false);
    }
    load();
  }, [user]);

  const handleNewConversation = useCallback(async () => {
    try {
      const conv = await api.post<Conversation>("/conversations", {
        title: "New Chat",
        supervisor_mode: true,
      });
      setConversations((prev) => [conv, ...prev]);
      navigate(`/?id=${conv.id}`);
    } catch {
      // Error creating conversation
    }
  }, [navigate]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      setDeleteTarget(id);
    },
    [],
  );

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/conversations/${id}`);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        // If we're viewing the deleted conversation, go back to home
        const params = new URLSearchParams(window.location.search);
        if (params.get("id") === id) {
          setSearchParams({});
        }
      } catch {
        // Error deleting
      }
      setDeleteTarget(null);
    },
    [setSearchParams],
  );

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api.get<ConversationListResponse>("/conversations");
      setConversations(data.items || []);
    } catch {
      // Silent
    }
  }, []);

  if (isLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <ChatSidebar
        conversations={conversations}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <Outlet
          context={{
            conversations,
            setConversations,
            refreshConversations,
            handleNewConversation,
          }}
        />
      </main>

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
                onClick={() => confirmDelete(deleteTarget)}
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
