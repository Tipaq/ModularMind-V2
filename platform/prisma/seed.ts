import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Dev client (required for Engine registration)
  const client = await prisma.client.upsert({
    where: { id: "dev-client-001" },
    update: {},
    create: {
      id: "dev-client-001",
      name: "Dev Client",
    },
  });
  console.log(`Seeded client: ${client.name} (${client.id})`);

  // Dev engine (must match ENGINE_API_KEY env var)
  const engine = await prisma.engine.upsert({
    where: { apiKey: "mmk_dev-engine-api-key-2024" },
    update: {},
    create: {
      id: "dev-engine-001",
      name: "Dev Engine",
      url: "http://localhost:8000",
      apiKey: "mmk_dev-engine-api-key-2024",
      clientId: client.id,
      status: "registered",
    },
  });
  console.log(`Seeded engine: ${engine.name} (${engine.id})`);

  // Basic test agent
  const agent = await prisma.agent.upsert({
    where: { id: "test-assistant-001" },
    update: {},
    create: {
      id: "test-assistant-001",
      name: "Test Assistant",
      description: "A basic general-purpose assistant for testing.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt:
          "You are a helpful, friendly assistant. Answer questions clearly and concisely.",
        temperature: 0.7,
        max_tokens: 2048,
        memory_enabled: false,
        rag_config: {
          enabled: false,
          collection_ids: [],
          retrieval_count: 5,
          similarity_threshold: 0.7,
        },
      },
      tags: ["test", "general"],
    },
  });

  console.log(`Seeded agent: ${agent.name} (${agent.id})`);

  // ── Test agents for graph ──

  const researcher = await prisma.agent.upsert({
    where: { id: "test-researcher-001" },
    update: {},
    create: {
      id: "test-researcher-001",
      name: "Researcher",
      description: "Gathers and synthesizes information on a given topic.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt:
          "You are a research specialist. When given a topic, provide a thorough, well-structured summary with key facts and insights. Be precise and cite sources when possible.",
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: false,
      },
      tags: ["research", "analysis"],
    },
  });
  console.log(`Seeded agent: ${researcher.name} (${researcher.id})`);

  const writer = await prisma.agent.upsert({
    where: { id: "test-writer-001" },
    update: {},
    create: {
      id: "test-writer-001",
      name: "Writer",
      description: "Transforms research into polished, readable content.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt:
          "You are a professional writer. Take the research provided and produce clear, engaging, well-structured content. Use headings, bullet points, and concise language.",
        temperature: 0.7,
        max_tokens: 4096,
        memory_enabled: false,
      },
      tags: ["writing", "content"],
    },
  });
  console.log(`Seeded agent: ${writer.name} (${writer.id})`);

  const reviewer = await prisma.agent.upsert({
    where: { id: "test-reviewer-001" },
    update: {},
    create: {
      id: "test-reviewer-001",
      name: "Reviewer",
      description: "Reviews content for quality, accuracy, and clarity.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt:
          "You are a quality reviewer. Evaluate the content for accuracy, clarity, grammar, and completeness. Provide a final polished version with any corrections applied.",
        temperature: 0.2,
        max_tokens: 2048,
        memory_enabled: false,
      },
      tags: ["review", "quality"],
    },
  });
  console.log(`Seeded agent: ${reviewer.name} (${reviewer.id})`);

  // ── Test graph: Research → Write → Review pipeline ──

  const graph = await prisma.graph.upsert({
    where: { id: "test-graph-001" },
    update: {},
    create: {
      id: "test-graph-001",
      name: "Research Pipeline",
      description:
        "A 3-step pipeline: research a topic, write content from the research, then review for quality.",
      nodes: [
        {
          id: "node-start",
          type: "start",
          position: { x: 250, y: 0 },
          data: { label: "Start", type: "start" },
        },
        {
          id: "node-researcher",
          type: "agent",
          position: { x: 250, y: 150 },
          data: {
            label: "Researcher",
            type: "agent",
            agent_id: researcher.id,
          },
        },
        {
          id: "node-writer",
          type: "agent",
          position: { x: 250, y: 300 },
          data: {
            label: "Writer",
            type: "agent",
            agent_id: writer.id,
          },
        },
        {
          id: "node-reviewer",
          type: "agent",
          position: { x: 250, y: 450 },
          data: {
            label: "Reviewer",
            type: "agent",
            agent_id: reviewer.id,
          },
        },
        {
          id: "node-end",
          type: "end",
          position: { x: 250, y: 600 },
          data: { label: "End", type: "end" },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-start",
          target: "node-researcher",
          type: "execution",
          data: {},
        },
        {
          id: "edge-2",
          source: "node-researcher",
          target: "node-writer",
          type: "execution",
          data: {},
        },
        {
          id: "edge-3",
          source: "node-writer",
          target: "node-reviewer",
          type: "execution",
          data: {},
        },
        {
          id: "edge-4",
          source: "node-reviewer",
          target: "node-end",
          type: "execution",
          data: {},
        },
      ],
    },
  });
  console.log(`Seeded graph: ${graph.name} (${graph.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
