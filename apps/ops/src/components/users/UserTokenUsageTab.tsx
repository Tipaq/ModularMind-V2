import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, DollarSign, Cpu, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, cn, formatTokens, formatCost } from "@modularmind/ui";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "../../lib/api";
import type { TokenUsageResponse } from "./types";

const RANGES = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

export function UserTokenUsageTab({ userId }: { userId: string }) {
  const [data, setData] = useState<TokenUsageResponse | null>(null);
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<TokenUsageResponse>(
          `/admin/users/${userId}/token-usage?range=${range}`,
        );
        setData(res);
      } catch {
        setData(null);
      }
      setLoading(false);
    })();
  }, [userId, range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <TrendingUp className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No usage data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              range === r.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="h-4 w-4" />
              <span className="text-xs">Prompt Tokens</span>
            </div>
            <p className="text-xl font-bold">{formatTokens(data.summary.total_prompt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Cpu className="h-4 w-4" />
              <span className="text-xs">Completion Tokens</span>
            </div>
            <p className="text-xl font-bold">{formatTokens(data.summary.total_completion)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Est. Cost</span>
            </div>
            <p className="text-xl font-bold">{formatCost(data.summary.estimated_cost_usd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Executions</span>
            </div>
            <p className="text-xl font-bold">{data.summary.execution_count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart */}
      {data.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Token Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => {
                    const date = new Date(d);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatTokens} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatTokens(value),
                    name === "tokens_prompt" ? "Prompt" : "Completion",
                  ]}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend
                  formatter={(v: string) =>
                    v === "tokens_prompt" ? "Prompt" : "Completion"
                  }
                />
                <Bar
                  dataKey="tokens_prompt"
                  stackId="a"
                  fill="hsl(var(--primary))"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="tokens_completion"
                  stackId="a"
                  fill="hsl(var(--primary) / 0.5)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-model breakdown */}
      {data.by_model.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.by_model.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.model}</span>
                    {m.provider ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {m.provider}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Local
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatTokens(m.tokens_prompt)} prompt</span>
                    <span>{formatTokens(m.tokens_completion)} completion</span>
                    <span className="font-medium text-foreground">
                      {formatCost(m.estimated_cost_usd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
