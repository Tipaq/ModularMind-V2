import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCost,
  formatDuration,
  formatDurationMs,
  formatNumber,
  isLocalModel,
  stripProvider,
} from "./utils";

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(30)).toBe("30s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3661)).toBe("1h 1m");
  });

  it("formats exact minutes", () => {
    expect(formatDuration(120)).toBe("2m 0s");
  });
});

describe("formatDurationMs", () => {
  it("formats milliseconds", () => {
    expect(formatDurationMs(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDurationMs(1500)).toBe("1.5s");
  });

  it("handles boundary at 1000ms", () => {
    expect(formatDurationMs(999)).toBe("999ms");
    expect(formatDurationMs(1000)).toBe("1.0s");
  });
});

describe("formatNumber", () => {
  it("formats small numbers as-is", () => {
    expect(formatNumber(42)).toBe("42");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1500)).toBe("1.5K");
  });

  it("formats millions with M suffix", () => {
    expect(formatNumber(2500000)).toBe("2.5M");
  });

  it("handles boundary at 1000", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1000)).toBe("1.0K");
  });
});

describe("formatCost", () => {
  it('formats null as "--"', () => {
    expect(formatCost(null)).toBe("--");
  });

  it("formats small costs", () => {
    expect(formatCost(0.001)).toBe("<$0.01");
  });

  it("formats normal costs", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });

  it("formats zero cost", () => {
    expect(formatCost(0)).toBe("<$0.01");
  });
});

describe("stripProvider", () => {
  it("strips openai prefix", () => {
    expect(stripProvider("openai:gpt-4")).toBe("gpt-4");
  });

  it("strips ollama prefix", () => {
    expect(stripProvider("ollama:llama3")).toBe("llama3");
  });

  it("strips anthropic prefix", () => {
    expect(stripProvider("anthropic:claude-3")).toBe("claude-3");
  });

  it("returns unchanged if no known prefix", () => {
    expect(stripProvider("unknown:model")).toBe("unknown:model");
  });

  it("returns unchanged if no colon", () => {
    expect(stripProvider("gpt-4")).toBe("gpt-4");
  });
});

describe("isLocalModel", () => {
  it("returns true for ollama models", () => {
    expect(isLocalModel("ollama:llama3")).toBe(true);
  });

  it("returns false for cloud models", () => {
    expect(isLocalModel("openai:gpt-4")).toBe(false);
    expect(isLocalModel("anthropic:claude-3")).toBe(false);
  });

  it("returns false for bare model name", () => {
    expect(isLocalModel("llama3")).toBe(false);
  });
});
