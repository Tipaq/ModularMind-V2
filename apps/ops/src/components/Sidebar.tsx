import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  LogOut,
  Layers,
  User,
  Users,
  Bot,
  GitFork,
  Settings2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@modularmind/ui";
import { useAuthStore } from "../stores/auth";

interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", to: "/", icon: LayoutDashboard, end: true },
      { name: "Monitoring", to: "/monitoring", icon: Activity },
    ],
  },
  {
    label: "Platform",
    items: [
      { name: "Models", to: "/models", icon: Layers },
      { name: "Agents", to: "/agents", icon: Bot },
      { name: "Graphs", to: "/graphs", icon: GitFork },
    ],
  },
  {
    label: "Workspace",
    items: [
      { name: "Knowledge", to: "/knowledge", icon: BookOpen },
      { name: "Playground", to: "/playground", icon: FlaskConical },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Users", to: "/users", icon: Users },
      { name: "Configuration", to: "/configuration", icon: Settings2 },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    window.location.href = "/ops/login";
  };

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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-purple-600">
                <Bot className="h-5 w-5 text-white" />
              </div>
            </motion.div>
          ) : (
            <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-600">
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
                  const isActive = item.end ? pathname === "/" : pathname.startsWith(item.to);
                  return (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: (startIdx + itemIdx) * 0.05 }}
                    >
                      <NavLink
                        to={item.to}
                        end={item.end}
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
                      </NavLink>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border/50 p-3">
        {user && (
          <div className={cn("mb-2 flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Sign out</span>}
        </button>
      </div>
    </motion.aside>
  );
}
