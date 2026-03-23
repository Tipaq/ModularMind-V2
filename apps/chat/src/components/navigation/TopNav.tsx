import { NavLink, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  FolderKanban,
  AppWindow,
  BookOpen,
  CalendarClock,
  KeyRound,
} from "lucide-react";
import { UserButton, useAuthStore } from "@modularmind/ui";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Chat", to: "/chat", icon: MessageSquare },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Apps", to: "/apps", icon: AppWindow },
  { label: "Knowledge", to: "/knowledge", icon: BookOpen },
  { label: "Tasks", to: "/tasks", icon: CalendarClock },
  { label: "Secrets", to: "/secrets", icon: KeyRound },
];

export function TopNav() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  return (
    <header className="h-12 border-b border-border bg-background shrink-0 flex items-center px-4 gap-4">
      <span className="text-sm font-semibold text-foreground shrink-0 select-none">
        ModularMind
      </span>

      <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0">
        {user && (
          <UserButton
            user={{ email: user.email, role: user.role }}
            onSignOut={() => {
              logout();
              window.location.href = "/login";
            }}
            onNavigate={(path) => navigate(`/${path}`)}
          />
        )}
      </div>
    </header>
  );
}
