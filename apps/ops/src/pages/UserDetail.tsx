import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Users,
  Pencil,
  MessageCircle,
  TrendingUp,
  BookOpen,
  Trash2,
} from "lucide-react";
import {
  cn,
  PageHeader,
  Card,
  CardContent,
  Badge,
  Button,
  ConfirmDialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useAuthStore,
  formatTokens,
  formatCost,
} from "@modularmind/ui";
import { api } from "@modularmind/api-client";
import { roleConfig } from "../lib/constants";
import { EditUserDialog } from "../components/users/EditUserDialog";
import { UserConversationsTab } from "../components/users/UserConversationsTab";
import { UserTokenUsageTab } from "../components/users/UserTokenUsageTab";
import { UserKnowledgeTab } from "../components/users/UserKnowledgeTab";
import type { UserStats } from "@modularmind/api-client";

export function UserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentRole = useAuthStore((s) => s.user?.role ?? "user");

  const [user, setUser] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConvOpen, setDeleteConvOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const res = await api.get<UserStats>(`/admin/users/${userId}`);
      setUser(res);
    } catch {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await api.get<UserStats>(`/admin/users/${userId}`);
        if (active) setUser(res);
      } catch {
        if (active) setUser(null);
      }
      if (active) setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [userId]);

  const handleSaveUser = async (data: { role?: string; is_active?: boolean }) => {
    await api.patch(`/admin/users/${userId}`, data);
    await fetchUser();
  };

  const handleDeleteConversations = async () => {
    setActionLoading(true);
    try {
      await api.delete(`/admin/users/${userId}/conversations`);
    } catch (err) {
      console.error("[UserDetail] Failed to delete conversations:", err);
    }
    setActionLoading(false);
    setDeleteConvOpen(false);
    await fetchUser();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">User not found</p>
        <Button variant="outline" onClick={() => navigate("/users")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Users
        </Button>
      </div>
    );
  }

  const role = roleConfig[user.role] || roleConfig.user;
  const RoleIcon = role.icon;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/users")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          icon={Users}
          gradient="from-primary to-primary/70"
          title={user.email}
          description="User details and analytics"
        />
      </div>

      {/* User info card */}
      <Card>
        <CardContent className="py-4 px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs capitalize",
                  role.color,
                )}
              >
                <RoleIcon className="h-3 w-3" />
                {user.role}
              </span>
              <Badge variant={user.is_active ? "default" : "destructive"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Joined {new Date(user.created_at).toLocaleDateString()}
              </span>
              {user.last_active_at && (
                <span className="text-xs text-muted-foreground">
                  Last active {new Date(user.last_active_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>{user.conversation_count} conversations</span>
              <span>
                {formatTokens(
                  user.total_tokens_prompt + user.total_tokens_completion,
                )}{" "}
                tokens
              </span>
              <span>{user.execution_count} executions</span>
              <span>{formatCost(user.estimated_cost_usd)} est. cost</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit User
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteConvOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete All Conversations
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conversations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conversations" className="gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            Conversations
          </TabsTrigger>
          <TabsTrigger value="token-usage" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Token Usage
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Knowledge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations">
          <UserConversationsTab userId={userId!} />
        </TabsContent>
        <TabsContent value="token-usage">
          <UserTokenUsageTab userId={userId!} />
        </TabsContent>
        <TabsContent value="knowledge">
          <UserKnowledgeTab userId={userId!} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {editOpen && (
        <EditUserDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          user={user}
          currentUserRole={currentRole}
          onSave={handleSaveUser}
        />
      )}

      <ConfirmDialog
        open={deleteConvOpen}
        onOpenChange={setDeleteConvOpen}
        title="Delete All Conversations"
        description={`This will permanently delete all conversations and messages for ${user.email}. This action cannot be undone.`}
        confirmLabel="Delete All"
        destructive
        loading={actionLoading}
        onConfirm={handleDeleteConversations}
      />

    </div>
  );
}
