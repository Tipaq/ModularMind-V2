import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          AI Agent Orchestration
          <br />
          <span className="text-primary">Made Simple</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Create, deploy, and manage AI agents with visual graph-based workflows.
          Multi-model, multi-provider, with built-in memory and RAG.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/features"
            className="rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-t bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold">Platform Highlights</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Visual Graph Editor", desc: "Design multi-agent workflows with a node-based editor. Supervisors, routers, and tools." },
              { title: "Multi-Model Support", desc: "Ollama, OpenAI, Anthropic — run any model, switch providers in one click." },
              { title: "Built-in Memory", desc: "Fact extraction, vector embeddings, and memory consolidation. Agents that remember." },
              { title: "RAG Pipeline", desc: "Upload documents, auto-chunk, embed, and retrieve. Hybrid search with reranking." },
              { title: "MCP Tool Integration", desc: "Connect external tools via Model Context Protocol sidecars. Sandboxed execution." },
              { title: "Release Channels", desc: "dev → beta → stable. Promote agents and graphs through deployment channels." },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border bg-card p-5">
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
