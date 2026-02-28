"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Server, Settings, Bot, GitFork, Layout, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@modularmind/ui";

const NAV = [
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/engines", label: "Engines", icon: Server },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const STUDIO_NAV = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/graphs", label: "Graphs", icon: GitFork },
  { href: "/templates", label: "Templates", icon: Layout },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r bg-muted/30">
      <div className="border-b px-4 py-4">
        <Link href="/" className="text-lg font-bold">
          ModularMind
        </Link>
        <p className="text-xs text-muted-foreground">Platform Admin</p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <p className="mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">Admin</p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}

        <p className="mb-1 mt-4 px-2 text-xs font-medium uppercase text-muted-foreground">
          Studio
        </p>
        {STUDIO_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t p-3">
        <ThemeToggle variant="segmented" />
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </Link>
      </div>
    </aside>
  );
}
