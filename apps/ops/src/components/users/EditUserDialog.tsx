import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  cn,
} from "@modularmind/ui";
import type { Role } from "@modularmind/ui";
import type { UserStats } from "@modularmind/api-client";

const ROLES: { value: Role; label: string; level: number }[] = [
  { value: "owner", label: "Owner", level: 2 },
  { value: "admin", label: "Admin", level: 1 },
  { value: "user", label: "User", level: 0 },
];

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserStats;
  currentUserRole: Role;
  onSave: (data: { role?: string; is_active?: boolean }) => Promise<void>;
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  currentUserRole,
  onSave,
}: EditUserDialogProps) {
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRole(user.role);
    setIsActive(user.is_active);
  }, [user]);

  const currentLevel = ROLES.find((r) => r.value === currentUserRole)?.level ?? 0;
  const assignableRoles = ROLES.filter((r) => r.level <= currentLevel);

  const hasChanges = role !== user.role || isActive !== user.is_active;

  const handleSave = async () => {
    setSaving(true);
    const data: { role?: string; is_active?: boolean } = {};
    if (role !== user.role) data.role = role;
    if (isActive !== user.is_active) data.is_active = isActive;
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <div className="flex gap-2">
              {assignableRoles.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    role === r.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsActive(true)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-success bg-success text-success-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                Active
              </button>
              <button
                onClick={() => setIsActive(false)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  !isActive
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                Inactive
              </button>
            </div>
          </div>

          {hasChanges && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Changes:
              {role !== user.role && (
                <span className="ml-2">
                  Role: <Badge variant="secondary" className="mx-1">{user.role}</Badge>
                  &rarr; <Badge className="mx-1">{role}</Badge>
                </span>
              )}
              {isActive !== user.is_active && (
                <span className="ml-2">
                  Status: {user.is_active ? "Active" : "Inactive"} &rarr;{" "}
                  {isActive ? "Active" : "Inactive"}
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
