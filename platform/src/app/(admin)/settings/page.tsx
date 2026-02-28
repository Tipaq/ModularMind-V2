"use client";

import { useSession } from "next-auth/react";
import { Settings, User, Shield } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform configuration</p>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="font-medium">Profile</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Name</label>
              <p className="text-sm">{session?.user?.name ?? "—"}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Email</label>
              <p className="text-sm">{session?.user?.email ?? "—"}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Role</label>
              <p className="text-sm capitalize">{(session?.user as { role?: string })?.role ?? "—"}</p>
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-medium">Security</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Authentication is managed through next-auth credentials provider.
            To add more users or change passwords, use the Prisma Studio.
          </p>
          <div className="mt-3">
            <code className="rounded bg-muted px-2 py-1 text-xs">pnpm db:studio</code>
          </div>
        </section>

        {/* Platform */}
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="font-medium">Platform</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span>2.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Environment</span>
              <span>{process.env.NODE_ENV}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
