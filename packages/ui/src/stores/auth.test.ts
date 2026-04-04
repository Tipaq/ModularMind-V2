import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "./auth";
import { AUTH_SESSION_EXPIRED_EVENT } from "@modularmind/api-client";

const USER_KEY = "modularmind_user";
const TEST_USER = { id: "u1", email: "test@test.com", role: "user" as const };

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: true });
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadFromSession", () => {
    it("reads user from sessionStorage and sets state", () => {
      sessionStorage.setItem(USER_KEY, JSON.stringify(TEST_USER));

      useAuthStore.getState().loadFromSession();

      expect(useAuthStore.getState().user).toEqual(TEST_USER);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("sets isLoading=false when no stored user", () => {
      useAuthStore.getState().loadFromSession();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("removes corrupt JSON from sessionStorage", () => {
      sessionStorage.setItem(USER_KEY, "{invalid-json");

      useAuthStore.getState().loadFromSession();

      expect(sessionStorage.getItem(USER_KEY)).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe("login", () => {
    it("sends POST to /api/v1/auth/login and stores user on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ user: TEST_USER }),
        }),
      );

      const success = await useAuthStore.getState().login("test@test.com", "password123");

      expect(success).toBe(true);
      expect(useAuthStore.getState().user).toEqual(TEST_USER);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(sessionStorage.getItem(USER_KEY)).toBe(JSON.stringify(TEST_USER));
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/auth/login",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      );
    });

    it("returns false on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false }),
      );

      const success = await useAuthStore.getState().login("bad@test.com", "wrong");

      expect(success).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("logout", () => {
    it("clears sessionStorage and resets state", () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      useAuthStore.setState({ user: TEST_USER, isLoading: false });
      sessionStorage.setItem(USER_KEY, JSON.stringify(TEST_USER));

      useAuthStore.getState().logout();

      expect(sessionStorage.getItem(USER_KEY)).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("fires POST /api/v1/auth/logout as fire-and-forget", () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      useAuthStore.getState().logout();

      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/auth/logout",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
  });

  describe("AUTH_SESSION_EXPIRED_EVENT", () => {
    it("triggers logout on session expiry event", () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      useAuthStore.setState({ user: TEST_USER, isLoading: false });

      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));

      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});
