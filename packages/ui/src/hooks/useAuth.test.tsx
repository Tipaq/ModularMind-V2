import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AUTH_SESSION_EXPIRED_EVENT } from "@modularmind/api-client";
import { useAuth } from "./useAuth";
import { useAuthStore } from "../stores/auth";
import type { ReactNode } from "react";

const TEST_USER = { id: "u1", email: "test@test.com", role: "user" as const };

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function createMockApi() {
  return { get: vi.fn().mockResolvedValue({ id: "u1" }) };
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    useAuthStore.setState({ user: null, isLoading: true });
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls loadFromSession on mount", () => {
    sessionStorage.setItem("modularmind_user", JSON.stringify(TEST_USER));
    const api = createMockApi();

    renderHook(() => useAuth({ api }), { wrapper: Wrapper });

    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("validates token via api.get(/auth/me) when user is found", async () => {
    sessionStorage.setItem("modularmind_user", JSON.stringify(TEST_USER));
    const api = createMockApi();

    renderHook(() => useAuth({ api }), { wrapper: Wrapper });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/auth/me");
    });
  });

  it("calls logout when api.get fails", async () => {
    sessionStorage.setItem("modularmind_user", JSON.stringify(TEST_USER));
    const api = createMockApi();
    api.get.mockRejectedValue(new Error("Unauthorized"));

    renderHook(() => useAuth({ api }), { wrapper: Wrapper });

    await waitFor(() => {
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  it("navigates to /login when requireAuth=true and no user after loading", async () => {
    const api = createMockApi();

    renderHook(() => useAuth({ requireAuth: true, api }), { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  it("does not navigate when requireAuth=false", async () => {
    const api = createMockApi();

    renderHook(() => useAuth({ requireAuth: false, api }), { wrapper: Wrapper });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("handles AUTH_SESSION_EXPIRED_EVENT with logout and navigation", async () => {
    sessionStorage.setItem("modularmind_user", JSON.stringify(TEST_USER));
    const api = createMockApi();

    renderHook(() => useAuth({ requireAuth: true, api }), { wrapper: Wrapper });

    await waitFor(() => {
      expect(useAuthStore.getState().user).toEqual(TEST_USER);
    });

    act(() => {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    });

    await waitFor(() => {
      expect(useAuthStore.getState().user).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });
});
