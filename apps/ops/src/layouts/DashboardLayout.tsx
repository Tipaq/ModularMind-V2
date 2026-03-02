import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";

export default function DashboardLayout() {
  const { user, isLoading, loadFromSession, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadFromSession();
  }, [loadFromSession]);

  // Validate session against server when a stored user is found
  useEffect(() => {
    if (!user || isLoading) return;
    api.get("/auth/me").catch(() => {
      logout();
    });
  }, [user, isLoading, logout]);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
