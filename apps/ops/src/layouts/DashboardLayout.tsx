import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { useAuth, PageLoader } from "@modularmind/ui";
import { api } from "@modularmind/api-client";

export function DashboardLayout() {
  const { user, isLoading } = useAuth({ requireAuth: true, api });

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <PageLoader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
