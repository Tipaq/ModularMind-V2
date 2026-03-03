export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return "--";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
