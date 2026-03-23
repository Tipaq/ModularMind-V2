import { NavLink, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { UserButton, useAuthStore } from "@modularmind/ui";

const NAV_ITEMS = [
  { label: "Chat", to: "/chat" },
  { label: "Projects", to: "/projects" },
  { label: "Apps", to: "/apps" },
  { label: "Knowledge", to: "/knowledge" },
  { label: "Tasks", to: "/tasks" },
  { label: "Secrets", to: "/secrets" },
];

export function TopNav() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  return (
    <header className="h-14 border-b border-border/50 bg-background shrink-0 flex items-stretch px-5">
      <div className="flex items-center shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 mr-2">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-foreground select-none">
          ModularMind
        </span>
      </div>

      <nav className="flex items-stretch justify-center gap-5 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex items-center text-[13px] transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center shrink-0">
        {user && (
          <UserButton
            variant="icon"
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
