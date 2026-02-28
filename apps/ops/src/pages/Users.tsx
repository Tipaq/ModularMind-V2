import { Users as UsersIcon, RefreshCw, Shield, UserCheck, User } from "lucide-react";
import { cn } from "@modularmind/ui";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

interface UserInfo {
  id: string;
  email: string;
  role: "owner" | "admin" | "user";
  is_active: boolean;
  created_at: string;
}

const roleConfig = {
  owner: { icon: Shield, color: "text-amber-500 bg-amber-500/10" },
  admin: { icon: UserCheck, color: "text-blue-500 bg-blue-500/10" },
  user: { icon: User, color: "text-muted-foreground bg-muted" },
};

export default function Users() {
  const { data, isLoading, refetch } = useApi<UserInfo[]>(
    () => api.get("/admin/users"),
    [],
  );

  const users = data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={UsersIcon}
        gradient="from-pink-500 to-rose-500"
        title="Users"
        description="User management and roles"
        actions={
          <button
            onClick={refetch}
            className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/50 p-12 text-center">
          <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">No users found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const role = roleConfig[u.role];
                const RoleIcon = role.icon;
                return (
                  <tr key={u.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs capitalize", role.color)}>
                        <RoleIcon className="h-3 w-3" />
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        u.is_active ? "bg-green-500" : "bg-red-500",
                      )} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
