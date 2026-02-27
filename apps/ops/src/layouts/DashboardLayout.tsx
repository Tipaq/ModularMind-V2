import { Outlet, NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/monitoring", label: "Monitoring" },
  { to: "/agents", label: "Agents" },
  { to: "/graphs", label: "Graphs" },
  { to: "/models", label: "Models" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/users", label: "Users" },
  { to: "/configuration", label: "Configuration" },
];

export default function DashboardLayout() {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-muted/50">
        <nav className="p-4">
          <h2 className="mb-4 text-lg font-semibold">ModularMind Ops</h2>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `block rounded px-3 py-2 text-sm ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
