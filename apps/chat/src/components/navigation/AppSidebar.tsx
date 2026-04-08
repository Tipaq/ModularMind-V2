import { memo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot,
  MessageSquare,
  FolderOpen,
  AppWindow,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, UserButton, useAuthStore, NewConversationButton } from "@modularmind/ui";
import { conversationAdapter } from "@modularmind/api-client";
import { useSidebarStore } from "../../stores/sidebar-store";
import { useRecentConversationsStore } from "../../stores/recent-conversations-store";
import { SidebarConversations } from "./SidebarConversations";

const SIDEBAR_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 56;

interface NavItemConfig {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { label: "Conversations", to: "/chat", icon: MessageSquare },
  { label: "Projects", to: "/projects", icon: FolderOpen },
  { label: "Apps", to: "/apps", icon: AppWindow },
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

export const AppSidebar = memo(function AppSidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const addConversation = useRecentConversationsStore((s) => s.addConversation);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const handleNewChat = async () => {
    try {
      const conversation = await conversationAdapter.createConversation({
        supervisor_mode: true,
      });
      addConversation(conversation);
      navigate(`/chat/${conversation.id}`);
    } catch {
      navigate("/chat");
    }
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

      {/* New conversation */}
      <div className="px-3 pt-3">
        <NewConversationButton
          onClick={handleNewChat}
          variant="secondary"
          collapsed={isCollapsed}
        />
      </div>

      {/* Navigation */}
      <nav className="px-3 pt-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.to} item={item} isCollapsed={isCollapsed} />
        ))}
      </nav>

      {/* Recent conversations */}
      <div className="flex-1 overflow-y-auto mt-2">
        {!isCollapsed && (
          <div className="border-t border-border/50 mx-3 mb-1 pt-2">
            <p className="px-3 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Recent
            </p>
          </div>
        )}
        <SidebarConversations />
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 p-2">
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
