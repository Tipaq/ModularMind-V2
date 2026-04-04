import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversations } from "./useConversations";
import type { ConversationAdapter } from "./conversation-adapter";
import type { Conversation, ConversationDetail } from "@modularmind/api-client";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Test Chat",
    agent_id: null,
    graph_id: null,
    user_email: "test@test.com",
    is_active: true,
    supervisor_mode: false,
    config: {},
    message_count: 3,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeConversationDetail(
  overrides: Partial<ConversationDetail> = {},
): ConversationDetail {
  return {
    ...makeConversation(),
    messages: [],
    ...overrides,
  };
}

function createMockAdapter(): ConversationAdapter {
  return {
    listConversations: vi.fn().mockResolvedValue({ items: [] }),
    getConversation: vi.fn().mockResolvedValue(makeConversationDetail()),
    createConversation: vi.fn().mockResolvedValue(
      makeConversation({ id: "new-conv", title: null, message_count: 0 }),
    ),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    patchConversation: vi.fn().mockResolvedValue(undefined),
    compactConversation: vi.fn().mockResolvedValue({
      summary_preview: "",
      compacted_count: 0,
      duration_ms: 0,
    }),
  };
}

function createDefaultOptions(adapter: ConversationAdapter) {
  return {
    authenticated: { id: "user-1" } as { id: string } | null,
    activeConversationId: null as string | null,
    setActiveConversationId: vi.fn(),
    setInitialMessages: vi.fn(),
    setChatConfig: vi.fn(),
    setEnabledAgentIds: vi.fn(),
    setEnabledGraphIds: vi.fn(),
    enabledAgentIds: [] as string[],
    enabledGraphIds: [] as string[],
    supervisorMode: false,
    modelId: null as string | null,
    adapter,
  };
}

describe("useConversations", () => {
  let adapter: ConversationAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = createMockAdapter();
  });

  describe("load on auth", () => {
    it("does not load when authenticated is falsy", async () => {
      const options = createDefaultOptions(adapter);
      options.authenticated = null;

      renderHook(() => useConversations(options));

      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.listConversations).not.toHaveBeenCalled();
    });

    it("loads conversations when authenticated becomes truthy", async () => {
      const convs = [makeConversation({ id: "c1", message_count: 5 })];
      vi.mocked(adapter.listConversations).mockResolvedValue({ items: convs });
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await waitFor(() => {
        expect(adapter.listConversations).toHaveBeenCalledWith(50);
        expect(result.current.conversations).toHaveLength(1);
      });
      expect(result.current.conversations[0].id).toBe("c1");
    });
  });

  describe("orphan cleanup", () => {
    it("deletes conversations with message_count=0", async () => {
      const items = [
        makeConversation({ id: "valid", message_count: 2 }),
        makeConversation({ id: "orphan", message_count: 0 }),
      ];
      vi.mocked(adapter.listConversations).mockResolvedValue({ items });
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await waitFor(() => {
        expect(adapter.deleteConversation).toHaveBeenCalledWith("orphan");
      });
      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0].id).toBe("valid");
    });

    it("does NOT delete the active conversation even if message_count=0", async () => {
      const items = [
        makeConversation({ id: "active-conv", message_count: 0 }),
        makeConversation({ id: "orphan", message_count: 0 }),
      ];
      vi.mocked(adapter.listConversations).mockResolvedValue({ items });
      const options = createDefaultOptions(adapter);
      options.activeConversationId = "active-conv";

      const { result } = renderHook(() => useConversations(options));

      await waitFor(() => {
        expect(result.current.conversations.length).toBeGreaterThanOrEqual(1);
      });
      expect(adapter.deleteConversation).toHaveBeenCalledWith("orphan");
      expect(adapter.deleteConversation).not.toHaveBeenCalledWith("active-conv");
      expect(result.current.conversations.some((c) => c.id === "active-conv")).toBe(true);
    });
  });

  describe("createConversation", () => {
    it("creates with supervisor_mode by default", async () => {
      const options = createDefaultOptions(adapter);
      options.supervisorMode = true;

      const { result } = renderHook(() => useConversations(options));

      let convId: string | null = null;
      await act(async () => {
        convId = await result.current.createConversation();
      });

      expect(convId).toBe("new-conv");
      expect(adapter.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ supervisor_mode: true }),
      );
      expect(options.setActiveConversationId).toHaveBeenCalledWith("new-conv");
      expect(options.setInitialMessages).toHaveBeenCalledWith([]);
    });

    it("sets agent_id when single agent selected", async () => {
      const options = createDefaultOptions(adapter);
      options.enabledAgentIds = ["agent-1"];

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.createConversation();
      });

      expect(adapter.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: "agent-1",
          supervisor_mode: false,
        }),
      );
    });

    it("sets graph_id when single graph selected", async () => {
      const options = createDefaultOptions(adapter);
      options.enabledGraphIds = ["graph-1"];

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.createConversation();
      });

      expect(adapter.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          graph_id: "graph-1",
          supervisor_mode: false,
        }),
      );
    });

    it("sets config.model_id in raw LLM mode", async () => {
      const options = createDefaultOptions(adapter);
      options.modelId = "openai:gpt-4o";
      options.supervisorMode = false;

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.createConversation();
      });

      expect(adapter.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { model_id: "openai:gpt-4o" },
        }),
      );
    });

    it("returns null and shows error on adapter failure", async () => {
      vi.mocked(adapter.createConversation).mockRejectedValue(new Error("fail"));
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      let convId: string | null = "initial";
      await act(async () => {
        convId = await result.current.createConversation();
      });

      expect(convId).toBeNull();
      expect(result.current.crudError).toBe("Failed to create conversation");
    });
  });

  describe("handleSelectConversation", () => {
    it("fetches conversation and restores config", async () => {
      const detail = makeConversationDetail({
        id: "c1",
        supervisor_mode: true,
        config: {
          enabled_agent_ids: ["a1"],
          enabled_graph_ids: ["g1"],
          model_id: "openai:gpt-4o",
          model_override: true,
        },
        messages: [
          {
            id: "m1",
            role: "user",
            content: "hello",
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      });
      vi.mocked(adapter.getConversation).mockResolvedValue(detail);
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.handleSelectConversation("c1");
      });

      expect(options.setActiveConversationId).toHaveBeenCalledWith("c1");
      expect(options.setInitialMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "m1", role: "user", content: "hello" }),
        ]),
      );
      expect(options.setEnabledAgentIds).toHaveBeenCalledWith(["a1"]);
      expect(options.setEnabledGraphIds).toHaveBeenCalledWith(["g1"]);
      expect(options.setChatConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          supervisorMode: true,
          modelId: "openai:gpt-4o",
          modelOverride: true,
        }),
      );
    });

    it("shows error on adapter failure", async () => {
      vi.mocked(adapter.getConversation).mockRejectedValue(new Error("fail"));
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.handleSelectConversation("bad-id");
      });

      expect(result.current.crudError).toBe("Failed to load conversation");
    });
  });

  describe("handleDeleteConversation", () => {
    it("removes from list and resets state if active", async () => {
      const convs = [makeConversation({ id: "c1" })];
      vi.mocked(adapter.listConversations).mockResolvedValue({ items: convs });
      const options = createDefaultOptions(adapter);
      options.activeConversationId = "c1";

      const { result } = renderHook(() => useConversations(options));

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
      });

      await act(async () => {
        await result.current.handleDeleteConversation("c1");
      });

      expect(adapter.deleteConversation).toHaveBeenCalledWith("c1");
      expect(result.current.conversations).toHaveLength(0);
      expect(options.setActiveConversationId).toHaveBeenCalledWith(null);
      expect(options.setInitialMessages).toHaveBeenCalledWith([]);
    });

    it("does not reset active state when deleting non-active conversation", async () => {
      const convs = [
        makeConversation({ id: "c1" }),
        makeConversation({ id: "c2" }),
      ];
      vi.mocked(adapter.listConversations).mockResolvedValue({ items: convs });
      const options = createDefaultOptions(adapter);
      options.activeConversationId = "c1";

      const { result } = renderHook(() => useConversations(options));

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.handleDeleteConversation("c2");
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(options.setActiveConversationId).not.toHaveBeenCalledWith(null);
    });
  });

  describe("handleRenameConversation", () => {
    it("patches via adapter and updates title in local state", async () => {
      const convs = [makeConversation({ id: "c1", title: "Old Title" })];
      vi.mocked(adapter.listConversations).mockResolvedValue({ items: convs });
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
      });

      await act(async () => {
        await result.current.handleRenameConversation("c1", "New Title");
      });

      expect(adapter.patchConversation).toHaveBeenCalledWith("c1", { title: "New Title" });
      expect(result.current.conversations[0].title).toBe("New Title");
    });
  });

  describe("error auto-dismiss", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("crudError auto-clears after 5 seconds", async () => {
      vi.mocked(adapter.createConversation).mockRejectedValue(new Error("fail"));
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.createConversation();
      });

      expect(result.current.crudError).toBe("Failed to create conversation");

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.crudError).toBeNull();

      vi.useRealTimers();
    });

    it("clearCrudError clears immediately", async () => {
      vi.mocked(adapter.createConversation).mockRejectedValue(new Error("fail"));
      const options = createDefaultOptions(adapter);

      const { result } = renderHook(() => useConversations(options));

      await act(async () => {
        await result.current.createConversation();
      });

      expect(result.current.crudError).not.toBeNull();

      act(() => {
        result.current.clearCrudError();
      });

      expect(result.current.crudError).toBeNull();

      vi.useRealTimers();
    });
  });
});
