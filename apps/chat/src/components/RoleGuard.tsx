import { Navigate } from "react-router-dom";
import { useAuthStore, type Role } from "@modularmind/ui";

const ADMIN_ROLES: Role[] = ["admin", "owner"];

interface RoleGuardProps {
  roles?: Role[];
  children: React.ReactNode;
}

export function RoleGuard({ roles = ADMIN_ROLES, children }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}
