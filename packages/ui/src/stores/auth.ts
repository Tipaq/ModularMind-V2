"use client";

import { create } from "zustand";
import { AUTH_SESSION_EXPIRED_EVENT } from "@modularmind/api-client";

export type Role = "owner" | "admin" | "user";

export interface User {
  id: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadFromSession: () => void;
}

const USER_KEY = "modularmind_user";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  loadFromSession: () => {
    const stored = sessionStorage.getItem(USER_KEY);
    if (stored) {
      try {
        set({ user: JSON.parse(stored), isLoading: false });
        return;
      } catch {
        sessionStorage.removeItem(USER_KEY);
      }
    }
    set({ isLoading: false });
  },

  login: async (email, password) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);

    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      credentials: "include",
    });

    if (!res.ok) return false;

    const data = await res.json();
    const user: User = data.user;
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, isLoading: false });
    return true;
  },

  logout: () => {
    sessionStorage.removeItem(USER_KEY);
    fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    set({ user: null, isLoading: false });
  },
}));

// Listen for session expiry from ApiClient and auto-logout
window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => {
  useAuthStore.getState().logout();
});
