import { memo, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash2, Check, X } from "lucide-react";
import { cn, Button, Input, useAuthStore } from "@modularmind/ui";
import type { Conversation } from "@modularmind/api-client";
import { conversationAdapter } from "@modularmind/api-client";
import { useRecentConversationsStore } from "../../stores/recent-conversations-store";
import { useSidebarStore } from "../../stores/sidebar-store";


interface ConvItemProps {
  conv: Conversation;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: (id: string) => void;
  onStartEdit: (conv: Conversation) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (value: string) => void;
  onDelete: (id: string) => void;
}

const ConvItem = memo(function ConvItem({
  conv, isActive, isEditing, editValue,
  onSelect, onStartEdit, onConfirmEdit, onCancelEdit, onEditChange, onDelete,
}: ConvItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
      onClick={() => onSelect(conv.id)}
    >
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="h-6 text-xs px-1"
            onClick={(e) => e.stopPropagation()}
          />
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); onConfirmEdit(); }}>
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <>
          <span
            className="flex-1 truncate text-[13px]"
            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(conv); }}
          >
            {conv.title || "New Chat"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
            onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
});

export const SidebarConversations = memo(function SidebarConversations() {
  const user = useAuthStore((s) => s.user);
  const { isCollapsed } = useSidebarStore();
  const { conversations, loaded, load, removeConversation, updateConversation } =
    useRecentConversationsStore();
  const navigate = useNavigate();
  const { conversationId: activeConversationId } = useParams<{ conversationId: string }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => { if (user) load(); }, [user, load]);

  const startEdit = useCallback((conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title || "New Chat");
  }, []);

  const confirmEdit = useCallback(async () => {
    if (editingId && editValue.trim()) {
      await conversationAdapter.patchConversation(editingId, { title: editValue.trim() });
      updateConversation(editingId, { title: editValue.trim() });
    }
    setEditingId(null);
  }, [editingId, editValue, updateConversation]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const handleDelete = useCallback(async (id: string) => {
    await conversationAdapter.deleteConversation(id);
    removeConversation(id);
    if (id === activeConversationId) {
      navigate("/chat");
    }
  }, [activeConversationId, removeConversation, navigate]);

  if (isCollapsed || !loaded) return null;

  const handleSelect = (id: string) => {
    navigate(`/chat/${id}`);
  };

  if (conversations.length === 0) {
    return (
      <div className="px-6 py-3 text-center text-xs text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-3">
      {conversations.map((conv) => (
        <ConvItem
          key={conv.id}
          conv={conv}
          isActive={activeConversationId === conv.id}
          isEditing={editingId === conv.id}
          editValue={editValue}
          onSelect={handleSelect}
          onStartEdit={startEdit}
          onConfirmEdit={confirmEdit}
          onCancelEdit={cancelEdit}
          onEditChange={setEditValue}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
});
