import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Check, X } from "lucide-react";
import { cn, Button, Input } from "@modularmind/ui";
import type { Conversation } from "@modularmind/api-client";
import { useConversationContext } from "../../contexts/ConversationContext";
import { useSidebarStore } from "../../stores/sidebar-store";

const MAX_RECENT = 8;

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

interface SidebarConversationsProps {
  searchFilter?: string;
}

export const SidebarConversations = memo(function SidebarConversations({ searchFilter = "" }: SidebarConversationsProps) {
  const ctx = useConversationContext();
  const { isCollapsed } = useSidebarStore();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = useCallback((conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title || "New Chat");
  }, []);

  const confirmEdit = useCallback(() => {
    if (editingId && editValue.trim() && ctx) {
      ctx.onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, ctx]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const recentConversations = useMemo(() => {
    if (!ctx) return [];
    const filtered = searchFilter
      ? ctx.conversations.filter((c) =>
          (c.title || "").toLowerCase().includes(searchFilter.toLowerCase()),
        )
      : ctx.conversations;
    return filtered.slice(0, MAX_RECENT);
  }, [ctx, searchFilter]);

  if (!ctx || isCollapsed) return null;

  const handleSelect = (id: string) => {
    ctx.onSelect(id);
    navigate(`/chat/${id}`);
  };

  if (recentConversations.length === 0) {
    return (
      <div className="px-4 py-3 text-center text-xs text-muted-foreground">
        {searchFilter ? "No matching conversations" : "No conversations yet"}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2">
      {recentConversations.map((conv) => (
        <ConvItem
          key={conv.id}
          conv={conv}
          isActive={ctx.activeConversationId === conv.id}
          isEditing={editingId === conv.id}
          editValue={editValue}
          onSelect={handleSelect}
          onStartEdit={startEdit}
          onConfirmEdit={confirmEdit}
          onCancelEdit={cancelEdit}
          onEditChange={setEditValue}
          onDelete={ctx.onDelete}
        />
      ))}
    </div>
  );
});
