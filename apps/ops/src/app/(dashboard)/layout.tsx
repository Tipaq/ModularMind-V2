export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* TODO: Sidebar navigation */}
      <aside className="w-64 border-r bg-muted/50">
        <nav className="p-4">
          <h2 className="mb-4 text-lg font-semibold">ModularMind Ops</h2>
          {/* TODO: Navigation links */}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
