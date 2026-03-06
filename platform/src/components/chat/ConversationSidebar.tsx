"use client";

import type { Conversation } from "@modularmind/api-client";
import { ConversationSidebar as SharedSidebar } from "@modularmind/ui";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  return <SharedSidebar {...props} />;
}
