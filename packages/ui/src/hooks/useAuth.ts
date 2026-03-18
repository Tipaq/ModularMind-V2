"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AUTH_SESSION_EXPIRED_EVENT } from "@modularmind/api-client";
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

  // Listen for session expiry from ApiClient and immediately redirect
  useEffect(() => {
    if (!requireAuth) return;
    const handleExpired = () => {
      logout();
      navigate("/login", { replace: true });
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
  }, [requireAuth, logout, navigate]);

  useEffect(() => {
    if (requireAuth && !isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [requireAuth, isLoading, user, navigate]);

  return { user, isLoading };
}
