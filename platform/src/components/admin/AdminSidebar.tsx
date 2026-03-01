"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Server,
  Settings2,
  Bot,
  GitFork,
  Layout,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn, UserButton } from "@modularmind/ui";
import { useSession, signOut } from "next-auth/react";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Admin",
    items: [
      { name: "Clients", href: "/clients", icon: Building2 },
      { name: "Engines", href: "/engines", icon: Server },
      { name: "Settings", href: "/settings", icon: Settings2 },
    ],
  },
  {
    label: "Studio",
    items: [
      { name: "Agents", href: "/agents", icon: Bot },
      { name: "Graphs", href: "/graphs", icon: GitFork },
      { name: "Templates", href: "/templates", icon: Layout },
    ],
  },
];

export function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  let globalIndex = 0;

  return (
    <motion.aside
      className="h-screen bg-card/50 backdrop-blur-xl border-r border-border/50 flex flex-col sticky top-0"
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border/50 px-4">
        <AnimatePresence mode="wait">
          {collapsed ? (
            <motion.div key="collapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60">
                <Bot className="h-5 w-5 text-white" />
              </div>
            </motion.div>
          ) : (
            <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold">ModularMind</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {sections.map((section, sectionIdx) => {
          const startIdx = globalIndex;
          globalIndex += section.items.length;
          return (
            <div key={section.label} className={cn(sectionIdx > 0 && "mt-5")}>
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-primary/60"
                  >
                    {section.label}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="space-y-1">
                {section.items.map((item, itemIdx) => {
                  const isActive = item.end
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: (startIdx + itemIdx) * 0.05 }}
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                          collapsed && "justify-center px-0",
                          isActive
                            ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted",
                        )}
                      >
                        <item.icon className={cn("h-5 w-5 flex-shrink-0", !isActive && "group-hover:scale-110 transition-transform")} />
                        <AnimatePresence>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: "auto" }}
                              exit={{ opacity: 0, width: 0 }}
                              transition={{ duration: 0.2 }}
                              className="font-medium text-sm truncate"
                            >
                              {item.name}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      {session?.user && (
        <div className="border-t border-border/50 p-3">
          <UserButton
            user={{
              name: session.user.name ?? undefined,
              email: session.user.email ?? "",
              role: (session.user as { role?: string }).role,
            }}
            collapsed={collapsed}
            onSignOut={() => signOut({ callbackUrl: "/login" })}
            onNavigate={(path) => router.push(`/${path}`)}
          />
        </div>
      )}
    </motion.aside>
  );
}
