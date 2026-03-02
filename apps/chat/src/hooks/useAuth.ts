import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";

export function useAuth({ requireAuth = true } = {}) {
  const { user, isLoading, loadFromSession, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadFromSession();
  }, [loadFromSession]);

  // Validate session against server when a stored user is found
  useEffect(() => {
    if (!user || isLoading) return;
    api.get("/auth/me").catch(() => {
      // Session invalid (token expired + refresh failed) — clean up
      logout();
    });
  }, [user, isLoading, logout]);

  useEffect(() => {
    if (requireAuth && !isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [requireAuth, isLoading, user, navigate]);

  return { user, isLoading };
}
