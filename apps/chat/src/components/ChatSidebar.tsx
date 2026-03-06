import type { Conversation } from "@modularmind/api-client";
import { useNavigate } from "react-router-dom";
import { ConversationSidebar, UserButton, useAuthStore } from "@modularmind/ui";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ChatSidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  return (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={onSelect}
      onCreate={onCreate}
      onDelete={onDelete}
      onRename={onRename}
      footer={
        user ? (
          <UserButton
            user={{ email: user.email, role: user.role }}
            onSignOut={() => {
              logout();
              window.location.href = "/login";
            }}
            onNavigate={(path) => navigate(`/${path}`)}
          />
        ) : null
      }
    />
  );
}
