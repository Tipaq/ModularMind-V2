import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  MessageCircle,
  Plus,
  Trash2,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { cn, relativeTime, UserButton } from "@modularmind/ui";
import { useAuthStore } from "../stores/auth";

export interface Conversation {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  supervisor_mode: boolean;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  onNewConversation,
  onDeleteConversation,
}: ChatSidebarProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const activeConversation = searchParams.get("id");

  const isOnChat = location.pathname === "/";

  return (
    <div className="w-72 shrink-0 border-r flex flex-col bg-card/50">
      <div className="p-3 border-b">
        <button
          onClick={onNewConversation}
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
                onClick={() => navigate(`/?id=${conv.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/?id=${conv.id}`);
                  }
                }}
                className={cn(
                  "group w-full cursor-pointer rounded-lg p-3 text-left transition-colors",
                  isOnChat && activeConversation === conv.id
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
                      onDeleteConversation(conv.id);
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

      <div className="border-t p-3">
        {user && (
          <UserButton
            user={{ email: user.email, role: user.role }}
            onSignOut={() => {
              logout();
              window.location.href = "/login";
            }}
            onNavigate={(path) => navigate(`/${path}`)}
          />
        )}
      </div>
    </div>
  );
}
