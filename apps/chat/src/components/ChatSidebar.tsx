import { memo } from "react";
import type { Conversation } from "@modularmind/api-client";
import { ConversationSidebar } from "@modularmind/ui";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export const ChatSidebar = memo(function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ChatSidebarProps) {
  return (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={onSelect}
      onCreate={onCreate}
      onDelete={onDelete}
      onRename={onRename}
    />
  );
});
