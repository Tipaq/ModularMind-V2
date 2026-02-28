export default function FeaturesPage() {
  const sections = [
    {
      title: "Agent Management",
      features: [
        "Create and configure AI agents with any LLM provider",
        "System prompt layers with YAML-based composition",
        "MCP tool integration with sandboxed sidecars",
        "Agent-scoped memory with fact extraction",
      ],
    },
    {
      title: "Graph Workflows",
      features: [
        "Visual node-based editor for multi-agent workflows",
        "Supervisor routing with conditional branching",
        "Parallel execution and loop support",
        "Step-by-step execution tracing via SSE",
      ],
    },
    {
      title: "Memory & RAG",
      features: [
        "Automatic fact extraction from conversations",
        "Vector storage with Qdrant (hybrid dense + sparse)",
        "Document upload, chunking, and embedding",
        "Memory consolidation with importance decay",
      ],
    },
    {
      title: "Platform Operations",
      features: [
        "Centralized agent and graph management",
        "Multi-engine sync with automatic config polling",
        "Engine registration and sync polling",
        "Ops console for monitoring and diagnostics",
      ],
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-bold">Features</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Everything you need to build and deploy AI agent workflows.
      </p>

      <div className="mt-12 space-y-12">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.features.map((f) => (
                <li key={f} className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm">
                  <span className="mt-0.5 text-primary">&#x2713;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
