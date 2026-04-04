import { describe, it, expect } from "vitest";
import { mapKnowledgeData, mapContextData } from "./mappers";
import type { RawKnowledgeData, RawContextData } from "./mappers";

describe("mapKnowledgeData", () => {
  it("maps collections and chunks from snake_case to camelCase", () => {
    const raw: RawKnowledgeData = {
      collections: [
        { collection_id: "c1", collection_name: "docs", chunk_count: 5 },
      ],
      chunks: [
        {
          chunk_id: "ch1",
          document_id: "d1",
          collection_id: "c1",
          collection_name: "docs",
          document_filename: "readme.md",
          content_preview: "Hello world",
          score: 0.95,
          chunk_index: 0,
        },
      ],
      total_results: 1,
    };

    const result = mapKnowledgeData(raw);

    expect(result.collections[0].collectionId).toBe("c1");
    expect(result.collections[0].collectionName).toBe("docs");
    expect(result.collections[0].chunkCount).toBe(5);
    expect(result.chunks[0].chunkId).toBe("ch1");
    expect(result.chunks[0].documentFilename).toBe("readme.md");
    expect(result.chunks[0].score).toBe(0.95);
    expect(result.totalResults).toBe(1);
  });

  it("handles empty/missing collections and chunks", () => {
    const result = mapKnowledgeData({});

    expect(result.collections).toEqual([]);
    expect(result.chunks).toEqual([]);
    expect(result.totalResults).toBe(0);
  });

  it("maps null document_filename to null", () => {
    const raw: RawKnowledgeData = {
      chunks: [
        {
          chunk_id: "ch1",
          document_id: "d1",
          collection_id: "c1",
          collection_name: "docs",
          document_filename: null,
          content_preview: "text",
          score: 0.5,
          chunk_index: 0,
        },
      ],
    };

    const result = mapKnowledgeData(raw);

    expect(result.chunks[0].documentFilename).toBeNull();
  });
});

describe("mapContextData", () => {
  it("maps full response with history, budget, and user_profile", () => {
    const raw: RawContextData = {
      history: {
        budget: {
          included_count: 10,
          total_chars: 5000,
          max_chars: 10000,
          budget_exceeded: false,
          context_window: 128000,
          history_budget_pct: 0.3,
          history_budget_tokens: 38400,
        },
        messages: [{ role: "user", content: "hi" }],
        summary: "A chat about testing",
      },
      user_profile: "Software engineer",
      budget_overview: {
        context_window: 128000,
        effective_context: 100000,
        max_pct: 0.8,
        layers: {
          history: { pct: 0.3, allocated: 30000, used: 5000 },
          memory: { pct: 0.2, allocated: 20000, used: 1000 },
          rag: { pct: 0.3, allocated: 30000, used: 0 },
          system: { pct: 0.2, allocated: 20000, used: 5000 },
        },
      },
    };

    const result = mapContextData(raw);

    expect(result.history!.budget!.includedCount).toBe(10);
    expect(result.history!.budget!.budgetExceeded).toBe(false);
    expect(result.history!.budget!.contextWindow).toBe(128000);
    expect(result.history!.messages).toHaveLength(1);
    expect(result.history!.summary).toBe("A chat about testing");
    expect(result.userProfile).toBe("Software engineer");
    expect(result.budgetOverview!.contextWindow).toBe(128000);
    expect(result.budgetOverview!.layers.history.used).toBe(5000);
    expect(result.budgetOverview!.layers.system!.pct).toBe(0.2);
  });

  it("handles null history", () => {
    const result = mapContextData({});

    expect(result.history).toBeNull();
    expect(result.userProfile).toBeNull();
    expect(result.budgetOverview).toBeNull();
  });

  it("handles history without budget", () => {
    const result = mapContextData({
      history: { messages: [], summary: "" },
    });

    expect(result.history!.budget).toBeNull();
    expect(result.history!.messages).toEqual([]);
  });

  it("maps budget_overview without system layer", () => {
    const raw: RawContextData = {
      budget_overview: {
        context_window: 128000,
        effective_context: 100000,
        max_pct: 0.8,
        layers: {
          history: { pct: 0.3, allocated: 30000, used: 5000 },
          memory: { pct: 0.2, allocated: 20000, used: 1000 },
          rag: { pct: 0.5, allocated: 50000, used: 0 },
        },
      },
    };

    const result = mapContextData(raw);

    expect(result.budgetOverview!.layers.system).toBeUndefined();
    expect(result.budgetOverview!.layers.rag.pct).toBe(0.5);
  });
});
