"use client";

import { useState, useRef, useEffect, useCallback, memo, type ReactNode } from "react";
import { Plus, Trash2, MessageSquare, Check, X } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "../lib/utils";
import { relativeTime } from "../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";

/** Minimal conversation shape required by the sidebar. */
export interface SidebarConversation {
  id: string;
  title: string | null;
  message_count: number;
  updated_at: string;
}

export interface ConversationSidebarProps {
  conversations: SidebarConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Optional footer content (e.g. UserButton). Rendered below the conversation list. */
  footer?: ReactNode;
  className?: string;
}

interface ConversationItemProps {
  conv: SidebarConversation;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: (id: string) => void;
  onStartEdit: (conv: SidebarConversation) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (value: string) => void;
  onRequestDelete: (conv: SidebarConversation) => void;
}

const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  isEditing,
  editValue,
  onSelect,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onEditValueChange,
  onRequestDelete,
}: ConversationItemProps) {
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
        "group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/30 hover:bg-muted/50 transition-colors",
        isActive && "bg-primary/10 border-l-2 border-l-primary",
      )}
      onClick={() => onSelect(conv.id)}
    >
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="h-6 text-xs px-1"
            onClick={(e) => e.stopPropagation()}
          />
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); onConfirmEdit(); }}>
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium truncate"
              onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(conv); }}
            >
              {conv.title || "New Chat"}
            </p>
            <p className="text-xs text-muted-foreground">
              {conv.message_count} msgs &middot; {relativeTime(conv.updated_at)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(conv);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
});

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  footer,
  className,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingConv, setDeletingConv] = useState<SidebarConversation | null>(null);

  const startEdit = useCallback((conv: SidebarConversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title || "New Chat");
  }, []);

  const confirmEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRename]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  return (
    <div className={cn("w-[240px] h-full border-r border-border/50 flex flex-col bg-card/30 shrink-0", className)}>
      <div className="p-3 border-b border-border/50">
        <Button onClick={onCreate} size="sm" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No conversations yet</p>
          </div>
        )}

        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={activeId === conv.id}
            isEditing={editingId === conv.id}
            editValue={editValue}
            onSelect={onSelect}
            onStartEdit={startEdit}
            onConfirmEdit={confirmEdit}
            onCancelEdit={cancelEdit}
            onEditValueChange={setEditValue}
            onRequestDelete={setDeletingConv}
          />
        ))}
      </div>


      <Dialog open={!!deletingConv} onOpenChange={(open) => { if (!open) setDeletingConv(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingConv?.title || "this conversation"}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeletingConv(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deletingConv) onDelete(deletingConv.id);
                setDeletingConv(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
