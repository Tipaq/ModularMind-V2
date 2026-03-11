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
    update: {
      config: {
        system_prompt: [
          "You are a thorough research specialist with web search tools.",
          "",
          "Research methodology:",
          "1. Start with a broad search to understand the topic landscape.",
          "2. Evaluate the results critically — if they are too shallow, off-topic, or missing key angles, search again with refined or alternative queries.",
          "3. Perform multiple searches (at least 2-3) using different keywords and angles to get comprehensive coverage.",
          "4. When you find promising sources, use the browse tool to read the full page content for deeper insights.",
          "",
          "CRITICAL OUTPUT RULES:",
          "- Your final answer must be a SYNTHESIZED report, NOT a list of search results.",
          "- NEVER copy-paste raw search results (titles, URLs, snippets) into your answer.",
          "- Instead, read and understand the information, then write an original summary organized by themes.",
          "- Use clear headings and structured paragraphs.",
          "- Cite sources inline (e.g., 'According to [Source Name]...') rather than listing URLs.",
          "- Focus on insights, key concepts, and practical takeaways — not on listing what you found.",
          "",
          "Important: Do NOT stop after a single search. Always cross-reference and explore multiple angles before writing your final answer.",
        ].join("\n"),
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: false,
        gateway_permissions: {
          browser: {
            enabled: true,
            allow_urls: ["https://*", "http://*"],
            deny_urls: ["*://localhost/*", "*://127.0.0.1/*", "*://0.0.0.0/*"],
            require_approval: false,
            max_page_load_seconds: 30,
            headless_only: true,
          },
          filesystem: { read: [], write: [], deny: [] },
          shell: { enabled: false, allow: [], deny: [], require_approval: true },
          network: { enabled: false, allow_domains: [], deny_domains: [] },
        },
      },
    },
    create: {
      id: "test-researcher-001",
      name: "Researcher",
      description: "Gathers and synthesizes information on a given topic.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt: [
          "You are a thorough research specialist with web search tools.",
          "",
          "Research methodology:",
          "1. Start with a broad search to understand the topic landscape.",
          "2. Evaluate the results critically — if they are too shallow, off-topic, or missing key angles, search again with refined or alternative queries.",
          "3. Perform multiple searches (at least 2-3) using different keywords and angles to get comprehensive coverage.",
          "4. When you find promising sources, use the browse tool to read the full page content for deeper insights.",
          "",
          "CRITICAL OUTPUT RULES:",
          "- Your final answer must be a SYNTHESIZED report, NOT a list of search results.",
          "- NEVER copy-paste raw search results (titles, URLs, snippets) into your answer.",
          "- Instead, read and understand the information, then write an original summary organized by themes.",
          "- Use clear headings and structured paragraphs.",
          "- Cite sources inline (e.g., 'According to [Source Name]...') rather than listing URLs.",
          "- Focus on insights, key concepts, and practical takeaways — not on listing what you found.",
          "",
          "Important: Do NOT stop after a single search. Always cross-reference and explore multiple angles before writing your final answer.",
        ].join("\n"),
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: false,
        gateway_permissions: {
          browser: {
            enabled: true,
            allow_urls: ["https://*", "http://*"],
            deny_urls: ["*://localhost/*", "*://127.0.0.1/*", "*://0.0.0.0/*"],
            require_approval: false,
            max_page_load_seconds: 30,
            headless_only: true,
          },
          filesystem: { read: [], write: [], deny: [] },
          shell: { enabled: false, allow: [], deny: [], require_approval: true },
          network: { enabled: false, allow_domains: [], deny_domains: [] },
        },
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

  // ── Deep Research Pipeline agents ──

  const browserPerms = {
    browser: {
      enabled: true,
      allow_urls: ["https://*", "http://*"],
      deny_urls: ["*://localhost/*", "*://127.0.0.1/*", "*://0.0.0.0/*"],
      require_approval: false,
      max_page_load_seconds: 30,
      headless_only: true,
    },
    filesystem: { read: [], write: [], deny: [] },
    shell: { enabled: false, allow: [], deny: [], require_approval: true },
    network: { enabled: false, allow_domains: [], deny_domains: [] },
  };

  const searcherConfig = {
    system_prompt: [
      "You are a web search specialist. Your ONLY job is to search the web thoroughly.",
      "",
      "Instructions:",
      "- Perform AT LEAST 3 different searches using varied keywords and angles.",
      "- For each search, use different terms to cover the topic broadly.",
      "- Include the full search results (titles, URLs, snippets) in your output.",
      "- Do NOT write a summary or analysis — just collect raw search results.",
      "- Format your output as a numbered list of all results found across all searches.",
    ].join("\n"),
    temperature: 0.3,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: browserPerms,
  };

  const deepSearcher = await prisma.agent.upsert({
    where: { id: "deep-searcher-001" },
    update: { config: searcherConfig },
    create: {
      id: "deep-searcher-001",
      name: "Web Searcher",
      description: "Performs multiple web searches with varied queries to gather raw results.",
      model: "qwen3:8b",
      provider: "ollama",
      config: searcherConfig,
      tags: ["research", "search"],
    },
  });
  console.log(`Seeded agent: ${deepSearcher.name} (${deepSearcher.id})`);

  const readerConfig = {
    system_prompt: [
      "You are a content reader and analyst. You receive raw search results from a previous agent.",
      "",
      "Instructions:",
      "- From the search results provided, identify the 3-5 most relevant and promising URLs.",
      "- Use the browse tool to read the full content of each selected page.",
      "- Extract key facts, insights, data points, and quotes from each page.",
      "- Organize your findings by THEME, not by source — group related information together.",
      "- Include the source URL as inline citations.",
      "- Focus on extracting substantive content, not just listing what each page says.",
    ].join("\n"),
    temperature: 0.3,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: browserPerms,
  };

  const deepReader = await prisma.agent.upsert({
    where: { id: "deep-reader-001" },
    update: { config: readerConfig },
    create: {
      id: "deep-reader-001",
      name: "Content Reader",
      description: "Browses the most relevant URLs and extracts detailed content.",
      model: "qwen3:8b",
      provider: "ollama",
      config: readerConfig,
      tags: ["research", "analysis"],
    },
  });
  console.log(`Seeded agent: ${deepReader.name} (${deepReader.id})`);

  const synthesizerConfig = {
    system_prompt: [
      "You are a research synthesizer. You receive analyzed content from a previous agent.",
      "",
      "YOUR OUTPUT IS THE FINAL ANSWER the user will see. Write it as a polished, comprehensive report.",
      "",
      "Instructions:",
      "- NEVER list raw search results, URLs, or snippets. The user wants a synthesized answer.",
      "- Write a well-structured report with clear headings (## format).",
      "- Organize by themes or categories, NOT by source.",
      "- Write in flowing paragraphs with key facts, insights, and practical takeaways.",
      "- Cite sources naturally inline (e.g., 'According to [Source]...').",
      "- Use bullet points only for lists of concrete items (tools, techniques, steps).",
      "- End with a brief conclusion summarizing the most important findings.",
      "- Write in the same language as the original user question.",
    ].join("\n"),
    temperature: 0.7,
    max_tokens: 4096,
    memory_enabled: false,
  };

  const deepSynthesizer = await prisma.agent.upsert({
    where: { id: "deep-synthesizer-001" },
    update: { config: synthesizerConfig },
    create: {
      id: "deep-synthesizer-001",
      name: "Synthesizer",
      description: "Synthesizes research findings into a comprehensive structured report.",
      model: "qwen3:8b",
      provider: "ollama",
      config: synthesizerConfig,
      tags: ["research", "writing"],
    },
  });
  console.log(`Seeded agent: ${deepSynthesizer.name} (${deepSynthesizer.id})`);

  // ── Deep Research Graph ──

  const deepResearchGraph = await prisma.graph.upsert({
    where: { id: "deep-research-001" },
    update: {},
    create: {
      id: "deep-research-001",
      name: "Deep Research",
      description:
        "3-step deep research pipeline: search the web with multiple queries, read the best sources in full, then synthesize into a structured report.",
      nodes: [
        {
          id: "node-start",
          type: "start",
          position: { x: 250, y: 0 },
          data: { label: "Start", type: "start" },
        },
        {
          id: "node-searcher",
          type: "agent",
          position: { x: 250, y: 150 },
          data: {
            label: "Web Searcher",
            type: "agent",
            agent_id: deepSearcher.id,
          },
        },
        {
          id: "node-reader",
          type: "agent",
          position: { x: 250, y: 300 },
          data: {
            label: "Content Reader",
            type: "agent",
            agent_id: deepReader.id,
          },
        },
        {
          id: "node-synthesizer",
          type: "agent",
          position: { x: 250, y: 450 },
          data: {
            label: "Synthesizer",
            type: "agent",
            agent_id: deepSynthesizer.id,
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
          target: "node-searcher",
          type: "execution",
          data: {},
        },
        {
          id: "edge-2",
          source: "node-searcher",
          target: "node-reader",
          type: "execution",
          data: {},
        },
        {
          id: "edge-3",
          source: "node-reader",
          target: "node-synthesizer",
          type: "execution",
          data: {},
        },
        {
          id: "edge-4",
          source: "node-synthesizer",
          target: "node-end",
          type: "execution",
          data: {},
        },
      ],
    },
  });
  console.log(`Seeded graph: ${deepResearchGraph.name} (${deepResearchGraph.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
