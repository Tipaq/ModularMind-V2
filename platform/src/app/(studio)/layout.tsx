export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-muted/50 p-4">
        <h2 className="mb-4 text-lg font-semibold">Studio</h2>
        {/* TODO: Studio navigation */}
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
