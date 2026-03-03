"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

interface UseAuthOptions {
  requireAuth?: boolean;
  api: { get: (path: string) => Promise<unknown> };
}

export function useAuth({ requireAuth = true, api }: UseAuthOptions) {
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
  }, [user, isLoading, logout, api]);

  useEffect(() => {
    if (requireAuth && !isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [requireAuth, isLoading, user, navigate]);

  return { user, isLoading };
}
