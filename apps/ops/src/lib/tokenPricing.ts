/**
 * Client-side token pricing table.
 * Mirror of engine/server/src/infra/token_pricing.py — update both when pricing changes.
 * Prices in USD per 1M tokens.
 */

const TOKEN_PRICING: Record<string, { prompt: number; completion: number }> = {
  // OpenAI
  "gpt-4o": { prompt: 2.5, completion: 10.0 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4-turbo": { prompt: 10.0, completion: 30.0 },
  "gpt-3.5-turbo": { prompt: 0.5, completion: 1.5 },
  "o1": { prompt: 15.0, completion: 60.0 },
  "o1-mini": { prompt: 3.0, completion: 12.0 },
  // Anthropic
  "claude-opus-4-6": { prompt: 15.0, completion: 75.0 },
  "claude-sonnet-4-5-20250929": { prompt: 3.0, completion: 15.0 },
  "claude-haiku-4-5-20251001": { prompt: 0.8, completion: 4.0 },
  // Google
  "gemini-2.0-flash": { prompt: 0.1, completion: 0.4 },
  "gemini-1.5-pro": { prompt: 1.25, completion: 5.0 },
  // Mistral
  "mistral-large-latest": { prompt: 2.0, completion: 6.0 },
  "mistral-small-latest": { prompt: 0.2, completion: 0.6 },
  // Cohere
  "command-r-plus": { prompt: 2.5, completion: 10.0 },
  "command-r": { prompt: 0.15, completion: 0.6 },
};

/**
 * Estimate cost in USD for a single execution.
 * Returns null for local/unknown models (Ollama, etc.).
 */
export function estimateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const modelName = modelId.includes(":") ? modelId.split(":")[1] : modelId;
  const pricing = TOKEN_PRICING[modelName];
  if (!pricing) return null;
  return (promptTokens * pricing.prompt + completionTokens * pricing.completion) / 1_000_000;
}

/** Format cost as a readable string. */
export function formatCostUSD(cost: number | null): string {
  if (cost === null) return "—";
  if (cost < 0.001) return "<$0.001";
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
