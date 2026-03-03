import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users as UsersIcon,
  RefreshCw,
  Shield,
  UserCheck,
  User,
  Search,
  Pencil,
  Eye,
} from "lucide-react";
import { cn, ROLE_COLORS, PageHeader, Badge, Button, Input } from "@modularmind/ui";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { EditUserDialog } from "../components/users/EditUserDialog";
import { formatTokens, formatCost } from "../components/users/format";
import type { UserStats, UserStatsListResponse } from "../components/users/types";

const roleConfig = {
  owner: { icon: Shield, color: ROLE_COLORS.owner },
  admin: { icon: UserCheck, color: ROLE_COLORS.admin },
  user: { icon: User, color: ROLE_COLORS.member },
};

export default function Users() {
  const navigate = useNavigate();
  const currentRole = useAuthStore((s) => s.user?.role ?? "user");

  const [users, setUsers] = useState<UserStats[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [editUser, setEditUser] = useState<UserStats | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (activeFilter) params.set("is_active", activeFilter);

      const res = await api.get<UserStatsListResponse>(`/admin/users?${params}`);
      setUsers(res.items);
      setTotal(res.total);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }, [search, roleFilter, activeFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSaveUser = async (data: { role?: string; is_active?: boolean }) => {
    if (!editUser) return;
    await api.patch(`/admin/users/${editUser.id}`, data);
    await fetchUsers();
  };

  const pageCount = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersIcon}
        gradient="from-primary to-primary/70"
        title="Users"
        description="Manage users, roles, and view per-user analytics"
        actions={
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email..."
            className="pl-9"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>

        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">
            {search || roleFilter || activeFilter
              ? "No users match your filters."
              : "No users found."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden md:table-cell">
                    Conversations
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden md:table-cell">
                    Total Tokens
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">
                    Est. Cost
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
                    Last Active
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const role = roleConfig[u.role] || roleConfig.user;
                  const RoleIcon = role.icon;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs capitalize",
                            role.color,
                          )}
                        >
                          <RoleIcon className="h-3 w-3" />
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.is_active ? "default" : "destructive"}>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                        {u.conversation_count}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                        {formatTokens(
                          u.total_tokens_prompt + u.total_tokens_completion,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                        {formatCost(u.estimated_cost_usd)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {u.last_active_at
                          ? new Date(u.last_active_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditUser(u)}
                            title="Edit user"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/users/${u.id}`)}
                            title="View details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount} ({total} users)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= pageCount}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editUser && (
        <EditUserDialog
          open={!!editUser}
          onOpenChange={(open) => {
            if (!open) setEditUser(null);
          }}
          user={editUser}
          currentUserRole={currentRole}
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
}
