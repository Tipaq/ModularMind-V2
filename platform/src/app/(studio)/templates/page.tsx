"use client";

import { Layout, Bot, GitFork } from "lucide-react";

const TEMPLATES = [
  {
    name: "Customer Support Agent",
    type: "agent" as const,
    description: "RAG-powered support agent with knowledge base integration.",
    provider: "ollama",
    model: "llama3.2",
    tags: ["support", "rag"],
  },
  {
    name: "Code Review Agent",
    type: "agent" as const,
    description: "Analyzes code changes and provides review feedback.",
    provider: "openai",
    model: "gpt-4o",
    tags: ["code", "review"],
  },
  {
    name: "Supervisor Graph",
    type: "graph" as const,
    description: "Multi-agent workflow with a supervisor routing tasks.",
    nodes: 4,
    tags: ["supervisor", "routing"],
  },
  {
    name: "RAG Pipeline Graph",
    type: "graph" as const,
    description: "Retrieval-augmented generation pipeline with reranking.",
    nodes: 3,
    tags: ["rag", "pipeline"],
  },
];

export default function TemplatesPage() {
  async function handleUse(template: (typeof TEMPLATES)[number]) {
    if (!confirm(`Create a new ${template.type} from "${template.name}"?`)) return;

    const url = template.type === "agent" ? "/api/agents" : "/api/graphs";
    const body =
      template.type === "agent"
        ? {
            name: template.name,
            description: template.description,
            model: template.model,
            provider: template.provider,
            tags: template.tags,
          }
        : {
            name: template.name,
            description: template.description,
          };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      window.location.href = `/${template.type}s/${data.id}`;
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Quick-start templates for agents and graphs
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((tpl) => (
          <div key={tpl.name} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              {tpl.type === "agent" ? (
                <Bot className="h-5 w-5 text-primary" />
              ) : (
                <GitFork className="h-5 w-5 text-primary" />
              )}
              <h3 className="font-medium">{tpl.name}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tpl.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {tpl.tags.map((tag) => (
                <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={() => handleUse(tpl)}
              className="mt-4 flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Layout className="h-4 w-4" />
              Use template
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
