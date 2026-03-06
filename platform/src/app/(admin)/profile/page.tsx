"use client";

import { useSession } from "next-auth/react";
import { User, Mail, Shield } from "lucide-react";
import { Avatar, AvatarFallback } from "@modularmind/ui";

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;

  if (!user) return null;

  const initials = user.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : (user.email?.charAt(0).toUpperCase() ?? "?");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account information</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Avatar & Identity */}
        <section className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{user.name || user.email}</p>
              {user.name && (
                <p className="text-sm text-muted-foreground">{user.email}</p>
              )}
              <p className="text-sm text-muted-foreground capitalize">
                {user.role ?? "member"}
              </p>
            </div>
          </div>
        </section>

        {/* Details */}
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="font-medium">Account Details</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm">{user.email ?? "—"}</p>
              </div>
            </div>
            {user.name && (
              <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm">{user.name}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="text-sm capitalize">
                  {user.role ?? "member"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
