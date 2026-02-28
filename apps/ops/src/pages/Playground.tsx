import { useState } from "react";
import { FlaskConical, Play, Loader2 } from "lucide-react";
import type { Agent, ExecutionRun } from "@modularmind/api-client";
import { PageHeader } from "../components/shared/PageHeader";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

export default function Playground() {
  const { data: agentsData } = useApi<{ items: Agent[] }>(
    () => api.get("/agents"),
    [],
  );

  const [selectedAgent, setSelectedAgent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionRun | null>(null);
  const [error, setError] = useState("");

  const agents = agentsData?.items ?? [];

  const handleExecute = async () => {
    if (!selectedAgent || !prompt.trim()) return;
    setRunning(true);
    setError("");
    setResult(null);

    try {
      const run = await api.post<ExecutionRun>("/executions/agent", {
        agent_id: selectedAgent,
        input_prompt: prompt,
      });
      setResult(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon={FlaskConical}
        gradient="from-fuchsia-500 to-pink-500"
        title="Playground"
        description="Test agents with live execution"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select an agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Enter your prompt..."
            />
          </div>

          <button
            onClick={handleExecute}
            disabled={running || !selectedAgent || !prompt.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? "Running..." : "Execute"}
          </button>
        </div>

        {/* Output */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Result</h3>
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium capitalize">{result.status}</span>
              </div>
              {result.output_data && (
                <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 text-xs font-mono">
                  {JSON.stringify(result.output_data, null, 2)}
                </pre>
              )}
              {result.error_message && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {result.error_message}
                </div>
              )}
              {result.steps.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">Steps ({result.steps.length})</h4>
                  <div className="space-y-2">
                    {result.steps.map((step) => (
                      <div key={step.id} className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{step.node_name ?? `Step ${step.step_number}`}</span>
                          <span className="capitalize text-muted-foreground">{step.status}</span>
                        </div>
                        {step.duration_ms != null && (
                          <span className="text-muted-foreground">{step.duration_ms}ms</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
              {running ? "Executing..." : "Select an agent and enter a prompt to get started"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
