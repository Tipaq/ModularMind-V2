import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatConfig } from "./useChatConfig";
import type { ChatConfigAdapter, ChatConfigData } from "./chat-config-adapter";

function makeMockConfigData(): ChatConfigData {
  return {
    agents: [{ id: "a1", name: "Agent 1" }],
    graphs: [{ id: "g1", name: "Graph 1" }],
    models: [{ id: "m1", name: "GPT-4o", provider: "openai", model_id: "gpt-4o", is_active: true, is_available: true, is_embedding: false }],
    supervisorLayers: [{ key: "routing", content: "Route tasks" }],
    userPreferences: "Prefer concise answers",
  } as ChatConfigData;
}

function createMockAdapter(): ChatConfigAdapter {
  return {
    fetchConfig: vi.fn().mockResolvedValue(makeMockConfigData()),
    updateSupervisorLayer: vi.fn().mockResolvedValue(true),
    savePreferences: vi.fn().mockResolvedValue(undefined),
  };
}

describe("useChatConfig", () => {
  let adapter: ChatConfigAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = createMockAdapter();
  });

  it("load() fetches config and populates state", async () => {
    const { result } = renderHook(() => useChatConfig(adapter));

    await act(async () => {
      await result.current.load();
    });

    expect(adapter.fetchConfig).toHaveBeenCalledOnce();
    expect(result.current.agents).toHaveLength(1);
    expect(result.current.graphs).toHaveLength(1);
    expect(result.current.models).toHaveLength(1);
    expect(result.current.supervisorLayers).toHaveLength(1);
    expect(result.current.userPreferences).toBe("Prefer concise answers");
    expect(result.current.loaded).toBe(true);
  });

  it("load() is idempotent — calling twice does not fetch twice", async () => {
    const { result } = renderHook(() => useChatConfig(adapter));

    await act(async () => {
      await result.current.load();
      await result.current.load();
    });

    expect(adapter.fetchConfig).toHaveBeenCalledOnce();
  });

  it("reload() forces a new fetch", async () => {
    const { result } = renderHook(() => useChatConfig(adapter));

    await act(async () => {
      await result.current.load();
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(adapter.fetchConfig).toHaveBeenCalledTimes(2);
  });

  it("updateSupervisorLayer patches local state on success", async () => {
    const { result } = renderHook(() => useChatConfig(adapter));

    await act(async () => {
      await result.current.load();
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.updateSupervisorLayer("routing", "New content");
    });

    expect(ok).toBe(true);
    expect(result.current.supervisorLayers[0].content).toBe("New content");
  });

  it("updateSupervisorLayer returns false when adapter has no method", async () => {
    const adapterNoWrite: ChatConfigAdapter = {
      fetchConfig: vi.fn().mockResolvedValue(makeMockConfigData()),
    };
    const { result } = renderHook(() => useChatConfig(adapterNoWrite));

    let ok = true;
    await act(async () => {
      ok = await result.current.updateSupervisorLayer("routing", "New");
    });

    expect(ok).toBe(false);
  });

  it("savePreferences updates local state", async () => {
    const { result } = renderHook(() => useChatConfig(adapter));

    await act(async () => {
      await result.current.savePreferences("Be verbose");
    });

    expect(adapter.savePreferences).toHaveBeenCalledWith("Be verbose");
    expect(result.current.userPreferences).toBe("Be verbose");
  });
});
