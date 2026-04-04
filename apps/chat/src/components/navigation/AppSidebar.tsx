import { memo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot,
  FolderOpen,
  BookOpen,
  AppWindow,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, UserButton, useAuthStore, type Role } from "@modularmind/ui";
import { useSidebarStore } from "../../stores/sidebar-store";
import { useConversationContext } from "../../contexts/ConversationContext";
import { SidebarConversations } from "./SidebarConversations";
import { SidebarProjects } from "./SidebarProjects";

const SIDEBAR_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 56;

const ADMIN_ROLES: Role[] = ["admin", "owner"];

interface NavItemConfig {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const BROWSE_ITEMS: NavItemConfig[] = [
  { label: "Projects", to: "/projects", icon: FolderOpen, end: true },
  { label: "Knowledge", to: "/knowledge", icon: BookOpen },
  { label: "Apps", to: "/apps", icon: AppWindow },
];

const MANAGE_ITEMS: NavItemConfig[] = [
  { label: "Knowledge", to: "/knowledge", icon: BookOpen },
  { label: "Apps", to: "/apps", icon: AppWindow },
  { label: "Tasks", to: "/tasks", icon: CalendarClock },
];

function SidebarNavItem({ item, isCollapsed }: { item: NavItemConfig; isCollapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          isCollapsed && "justify-center px-2",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

function SidebarSection({ label, isCollapsed }: { label: string; isCollapsed: boolean }) {
  if (isCollapsed) return null;
  return (
    <p className="px-3 pt-3 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
  );
}

export const AppSidebar = memo(function AppSidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const convCtx = useConversationContext();

  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const handleNewChat = () => {
    if (convCtx) {
      convCtx.onCreate();
    }
    navigate("/chat");
  };

  return (
    <aside
      className="h-full flex flex-col border-r border-border/50 bg-card/30 shrink-0 transition-[width] duration-200 ease-in-out"
      style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border/50 px-3">
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold select-none">ModularMind</span>
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 mx-auto">
            <Bot className="h-4 w-4 text-white" />
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={toggleCollapsed}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* New Chat */}
      <div className="px-3 pt-3">
        <button
          onClick={handleNewChat}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm transition-colors hover:bg-muted/50",
            isCollapsed && "justify-center px-2",
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>New chat</span>}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Conversations */}
        <SidebarSection label="Conversations" isCollapsed={isCollapsed} />
        <SidebarConversations />

        {/* Projects */}
        <SidebarSection label="Projects" isCollapsed={isCollapsed} />
        <SidebarProjects />

        {/* Browse */}
        {!isCollapsed && <div className="border-t border-border/50 mx-3 my-2" />}
        <nav className="px-3 space-y-0.5">
          {BROWSE_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} item={item} isCollapsed={isCollapsed} />
          ))}
        </nav>

        {/* Manage (admin only) */}
        {isAdmin && (
          <>
            <SidebarSection label="Manage" isCollapsed={isCollapsed} />
            <nav className="px-3 space-y-0.5">
              {MANAGE_ITEMS.map((item) => (
                <SidebarNavItem key={`manage-${item.to}`} item={item} isCollapsed={isCollapsed} />
              ))}
            </nav>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 p-3">
        {isCollapsed && (
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors mb-2"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {user && (
          <UserButton
            user={{ email: user.email, role: user.role }}
            collapsed={isCollapsed}
            onSignOut={handleLogout}
            onNavigate={(path) => navigate(`/${path}`)}
          />
        )}
      </div>
    </aside>
  );
});
