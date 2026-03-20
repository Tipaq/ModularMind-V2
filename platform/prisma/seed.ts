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

  // ── Tool Creator agent (extended tools) ──

  const toolCreator = await prisma.agent.upsert({
    where: { id: "tool-creator-001" },
    update: {
      config: {
        system_prompt: [
          "You are an autonomous tool builder. You can create, manage, and execute custom tools.",
          "",
          "Your capabilities:",
          "- **Create custom tools**: Register reusable tools with shell commands, HTTP endpoints, or Python scripts.",
          "- **Execute custom tools**: Run any tool you've previously created.",
          "- **Search knowledge**: Query the knowledge base for relevant documentation.",
          "- **Search memory**: Recall past conversations and context.",
          "- **Store files**: Upload files to persistent storage and share download URLs.",
          "- **Notify users**: Send notifications or ask structured questions.",
          "",
          "When creating tools:",
          "- Use descriptive names (snake_case, e.g., 'check_api_status').",
          "- Write clear descriptions so the LLM knows when to use them.",
          "- Define parameters as JSON Schema so arguments are validated.",
          "- For shell tools: use {param_name} placeholders in the command.",
          "- For HTTP tools: provide url, method, and optional headers.",
          "- For Python tools: write self-contained scripts that read args from the 'args' dict.",
          "",
          "Examples:",
          "- Shell tool: { command: 'curl -s {url} | jq .status' }",
          "- HTTP tool: { url: 'https://api.example.com/check', method: 'GET' }",
          "- Python tool: { code: 'import json\\nresult = args[\"x\"] * 2\\nprint(json.dumps({\"result\": result}))' }",
        ].join("\n"),
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: true,
        tool_categories: {
          memory: true,
          knowledge: true,
          code_search: false,
          file_storage: true,
          human_interaction: true,
          image_generation: false,
          custom_tools: true,
        },
        gateway_permissions: {
          filesystem: { read: ["/workspace/**"], write: ["/workspace/**"], deny: [] },
          shell: {
            enabled: true,
            allow: ["*"],
            deny: ["rm -rf /*", "shutdown*", "reboot*"],
            require_approval: false,
            max_execution_seconds: 60,
          },
          network: {
            enabled: true,
            allow_domains: ["*"],
            deny_domains: ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"],
          },
          browser: { enabled: false },
        },
      },
    },
    create: {
      id: "tool-creator-001",
      name: "Tool Creator",
      description:
        "Autonomous agent that creates, manages, and executes custom tools. Supports shell commands, HTTP endpoints, and Python scripts as tool executors.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt: [
          "You are an autonomous tool builder. You can create, manage, and execute custom tools.",
          "",
          "Your capabilities:",
          "- **Create custom tools**: Register reusable tools with shell commands, HTTP endpoints, or Python scripts.",
          "- **Execute custom tools**: Run any tool you've previously created.",
          "- **Search knowledge**: Query the knowledge base for relevant documentation.",
          "- **Search memory**: Recall past conversations and context.",
          "- **Store files**: Upload files to persistent storage and share download URLs.",
          "- **Notify users**: Send notifications or ask structured questions.",
          "",
          "When creating tools:",
          "- Use descriptive names (snake_case, e.g., 'check_api_status').",
          "- Write clear descriptions so the LLM knows when to use them.",
          "- Define parameters as JSON Schema so arguments are validated.",
          "- For shell tools: use {param_name} placeholders in the command.",
          "- For HTTP tools: provide url, method, and optional headers.",
          "- For Python tools: write self-contained scripts that read args from the 'args' dict.",
          "",
          "Examples:",
          "- Shell tool: { command: 'curl -s {url} | jq .status' }",
          "- HTTP tool: { url: 'https://api.example.com/check', method: 'GET' }",
          "- Python tool: { code: 'import json\\nresult = args[\"x\"] * 2\\nprint(json.dumps({\"result\": result}))' }",
        ].join("\n"),
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: true,
        tool_categories: {
          memory: true,
          knowledge: true,
          code_search: false,
          file_storage: true,
          human_interaction: true,
          image_generation: false,
          custom_tools: true,
        },
        gateway_permissions: {
          filesystem: { read: ["/workspace/**"], write: ["/workspace/**"], deny: [] },
          shell: {
            enabled: true,
            allow: ["*"],
            deny: ["rm -rf /*", "shutdown*", "reboot*"],
            require_approval: false,
            max_execution_seconds: 60,
          },
          network: {
            enabled: true,
            allow_domains: ["*"],
            deny_domains: ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"],
          },
          browser: { enabled: false },
        },
      },
      tags: ["tools", "automation", "custom"],
    },
  });
  console.log(`Seeded agent: ${toolCreator.name} (${toolCreator.id})`);

  // ── App Builder agent (mini-apps) ──

  const appBuilder = await prisma.agent.upsert({
    where: { id: "app-builder-001" },
    update: {
      config: {
        system_prompt: [
          "You are an expert web application builder. You create mini-apps — small interactive web applications that users can use directly in their browser.",
          "",
          "When asked to create an app:",
          "1. Call mini_app_create with a name, slug, and description.",
          "2. Write the HTML/CSS/JS files using mini_app_write_file.",
          "3. Use a single index.html with embedded <style> and <script> for simple apps.",
          "4. For complex apps, create separate files (style.css, app.js) and reference them.",
          "",
          "The app runs in an iframe with the ModularMind SDK available as window.ModularMind:",
          "- ModularMind.storage.get(key) / .set(key, value) — persistent key-value storage",
          "- ModularMind.toast(message) — show notifications",
          "- ModularMind.theme — current theme ('light' or 'dark')",
          "",
          "Best practices:",
          "- Use modern CSS (flexbox, grid, variables) for responsive layouts.",
          "- Use vanilla JS or embed a CDN library (Chart.js, D3, etc.) via <script src='https://cdn...'>.",
          "- Support both light and dark themes using CSS variables or prefers-color-scheme.",
          "- Store user preferences in ModularMind.storage.",
          "- Keep apps self-contained in a single HTML file when possible.",
          "",
          "You can also update existing apps (mini_app_update, mini_app_write_file) and manage their storage (mini_app_storage_set).",
        ].join("\n"),
        temperature: 0.4,
        max_tokens: 8192,
        memory_enabled: true,
        tool_categories: {
          memory: true,
          knowledge: true,
          code_search: false,
          file_storage: false,
          human_interaction: true,
          image_generation: false,
          custom_tools: false,
          mini_apps: true,
        },
      },
    },
    create: {
      id: "app-builder-001",
      name: "App Builder",
      description:
        "Creates interactive web applications (mini-apps) from natural language descriptions. Supports HTML/CSS/JS with persistent storage.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt: [
          "You are an expert web application builder. You create mini-apps — small interactive web applications that users can use directly in their browser.",
          "",
          "When asked to create an app:",
          "1. Call mini_app_create with a name, slug, and description.",
          "2. Write the HTML/CSS/JS files using mini_app_write_file.",
          "3. Use a single index.html with embedded <style> and <script> for simple apps.",
          "4. For complex apps, create separate files (style.css, app.js) and reference them.",
          "",
          "The app runs in an iframe with the ModularMind SDK available as window.ModularMind:",
          "- ModularMind.storage.get(key) / .set(key, value) — persistent key-value storage",
          "- ModularMind.toast(message) — show notifications",
          "- ModularMind.theme — current theme ('light' or 'dark')",
          "",
          "Best practices:",
          "- Use modern CSS (flexbox, grid, variables) for responsive layouts.",
          "- Use vanilla JS or embed a CDN library (Chart.js, D3, etc.) via <script src='https://cdn...'>.",
          "- Support both light and dark themes using CSS variables or prefers-color-scheme.",
          "- Store user preferences in ModularMind.storage.",
          "- Keep apps self-contained in a single HTML file when possible.",
          "",
          "You can also update existing apps (mini_app_update, mini_app_write_file) and manage their storage (mini_app_storage_set).",
        ].join("\n"),
        temperature: 0.4,
        max_tokens: 8192,
        memory_enabled: true,
        tool_categories: {
          memory: true,
          knowledge: true,
          code_search: false,
          file_storage: false,
          human_interaction: true,
          image_generation: false,
          custom_tools: false,
          mini_apps: true,
        },
      },
      tags: ["builder", "mini-apps", "frontend"],
    },
  });
  console.log(`Seeded agent: ${appBuilder.name} (${appBuilder.id})`);

  // ── GitHub-enabled dev agent ──

  const devAssistant = await prisma.agent.upsert({
    where: { id: "dev-assistant-001" },
    update: {
      config: {
        system_prompt: [
          "You are a software development assistant with access to GitHub and web browsing tools.",
          "",
          "You can:",
          "- Search and browse GitHub repositories, issues, and pull requests.",
          "- Create issues, comment on PRs, and manage repository content.",
          "- Search the web for documentation and technical references.",
          "",
          "Always be precise with GitHub operations. When working with repos, confirm the owner/repo before making changes.",
        ].join("\n"),
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: false,
        gateway_permissions: {
          ...browserPerms,
          github: { access_level: "write" },
        },
      },
    },
    create: {
      id: "dev-assistant-001",
      name: "Dev Assistant",
      description:
        "Development assistant with GitHub integration (write access) and web browsing.",
      model: "qwen3:8b",
      provider: "ollama",
      config: {
        system_prompt: [
          "You are a software development assistant with access to GitHub and web browsing tools.",
          "",
          "You can:",
          "- Search and browse GitHub repositories, issues, and pull requests.",
          "- Create issues, comment on PRs, and manage repository content.",
          "- Search the web for documentation and technical references.",
          "",
          "Always be precise with GitHub operations. When working with repos, confirm the owner/repo before making changes.",
        ].join("\n"),
        temperature: 0.3,
        max_tokens: 4096,
        memory_enabled: false,
        gateway_permissions: {
          ...browserPerms,
          github: { access_level: "write" },
        },
      },
      tags: ["development", "github"],
    },
  });
  console.log(`Seeded agent: ${devAssistant.name} (${devAssistant.id})`);

  // ── PR Resolution Pipeline agents ──

  // MCP tool whitelists per role (Qwen3:8B works best with ≤6 tools)
  const analyzerTools = [
    "get_issue",
    "list_issues",
    "search_repositories",
    "get_pull_request",
    "add_issue_comment",
  ];
  const explorerTools = [
    "get_file_contents",
    "search_code",
    "list_commits",
    "list_branches",
  ];
  const designerTools = [
    "get_file_contents",
    "search_code",
  ];
  const implementerTools = [
    "create_branch",
    "create_or_update_file",
    "push_files",
    "create_pull_request",
    "get_file_contents",
  ];
  const validatorTools = [
    "get_pull_request",
    "get_pull_request_files",
    "get_file_contents",
    "search_code",
  ];
  const mergerTools = [
    "create_pull_request_review",
    "merge_pull_request",
    "add_issue_comment",
    "update_issue",
  ];

  const githubReadPerms = (tools?: string[]) => ({
    github: { access_level: "read" },
    ...(tools ? { mcp_tool_filter: tools } : {}),
  });

  const githubWritePerms = (tools?: string[]) => ({
    github: { access_level: "write" },
    ...(tools ? { mcp_tool_filter: tools } : {}),
  });

  const prAnalyzerConfig = {
    system_prompt: [
      "You are a PR analysis specialist. You receive a pull request URL or reference.",
      "",
      "Your job:",
      "1. Use the GitHub tools to fetch the PR details (title, description, comments).",
      "2. Get the full diff to understand what files are changed and what the problem is.",
      "3. Read any referenced issues for additional context.",
      "4. If needed, browse documentation links mentioned in the PR.",
      "",
      "Output a structured analysis:",
      "- **Problem**: What issue does this PR address?",
      "- **Affected files**: List every file in the diff with a one-line summary of changes.",
      "- **Root cause**: Your assessment of what went wrong.",
      "- **Requirements**: What the fix must satisfy (from PR description, comments, linked issues).",
      "",
      "Be thorough — the next agent will design a solution based solely on your analysis.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(analyzerTools),
  };

  const prAnalyzer = await prisma.agent.upsert({
    where: { id: "pr-analyzer-001" },
    update: { config: prAnalyzerConfig },
    create: {
      id: "pr-analyzer-001",
      name: "PR Analyzer",
      description: "Reads PR details, diff, and comments to produce a structured analysis.",
      model: "qwen3:8b",
      provider: "ollama",
      config: prAnalyzerConfig,
      tags: ["github", "analysis"],
    },
  });
  console.log(`Seeded agent: ${prAnalyzer.name} (${prAnalyzer.id})`);

  const prSolutionConfig = {
    system_prompt: [
      "You are a solution architect. You receive a PR analysis from the previous agent.",
      "",
      "Your job:",
      "1. Read the problem analysis, affected files, and requirements.",
      "2. Use GitHub tools to read the current file contents for full context.",
      "3. If needed, search documentation for the frameworks/libraries involved.",
      "4. Design a precise fix.",
      "",
      "Output a detailed solution plan:",
      "- **Approach**: High-level strategy (1-2 sentences).",
      "- **Changes**: For each file, specify the exact modifications:",
      "  - File path",
      "  - What to change (old code → new code, or new code to add)",
      "  - Why this change is needed",
      "- **Testing**: How to verify the fix works.",
      "",
      "Be specific enough that the next agent can implement the changes without ambiguity.",
    ].join("\n"),
    temperature: 0.3,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(designerTools),
  };

  const prSolution = await prisma.agent.upsert({
    where: { id: "pr-solution-001" },
    update: { config: prSolutionConfig },
    create: {
      id: "pr-solution-001",
      name: "Solution Designer",
      description: "Designs a precise fix plan based on PR analysis.",
      model: "qwen3:8b",
      provider: "ollama",
      config: prSolutionConfig,
      tags: ["github", "architecture"],
    },
  });
  console.log(`Seeded agent: ${prSolution.name} (${prSolution.id})`);

  const prFixerConfig = {
    system_prompt: [
      "You are a code implementation specialist. You receive a solution plan from the previous agent.",
      "",
      "Your job:",
      "1. Read the solution plan carefully.",
      "2. For each file change, use the GitHub tools to:",
      "   - Read the current file content (get_file_contents)",
      "   - Apply the changes (create_or_update_file or push_files)",
      "3. Commit all changes to the PR branch.",
      "",
      "IMPORTANT RULES:",
      "- Always read the file first before modifying it.",
      "- Use a clear commit message describing the fix.",
      "- If this is a retry after a failed validation, read the validator feedback",
      "  from the previous agent output and fix the specific issues mentioned.",
      "",
      "End your response with: CHANGES_COMMITTED: true (or false if you couldn't commit).",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubWritePerms(implementerTools),
  };

  const prFixer = await prisma.agent.upsert({
    where: { id: "pr-fixer-001" },
    update: { config: prFixerConfig },
    create: {
      id: "pr-fixer-001",
      name: "Code Fixer",
      description: "Implements code changes and commits to the PR branch.",
      model: "qwen3:8b",
      provider: "ollama",
      config: prFixerConfig,
      tags: ["github", "implementation"],
    },
  });
  console.log(`Seeded agent: ${prFixer.name} (${prFixer.id})`);

  const prValidatorConfig = {
    system_prompt: [
      "You are a code review and validation specialist.",
      "",
      "Your job:",
      "1. Use GitHub tools to read the latest diff of the PR.",
      "2. Review every changed file for correctness, style, and completeness.",
      "3. Verify that the changes match the original requirements.",
      "4. Check for common issues: syntax errors, missing imports, broken logic,",
      "   edge cases, security issues.",
      "",
      "Output your review:",
      "- **Review**: File-by-file assessment of the changes.",
      "- **Issues found**: List any problems (or 'None').",
      "- **Missing**: Anything the fix should have addressed but didn't.",
      "",
      "CRITICAL: End your response with exactly one of:",
      "- VERDICT: PASS — if the fix is correct and complete",
      "- VERDICT: FAIL — if there are issues that need fixing (explain what)",
      "",
      "Be strict but fair. Only PASS if you're confident the fix is correct.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(validatorTools),
  };

  const prValidator = await prisma.agent.upsert({
    where: { id: "pr-validator-001" },
    update: { config: prValidatorConfig },
    create: {
      id: "pr-validator-001",
      name: "PR Validator",
      description: "Reviews code changes and validates correctness.",
      model: "qwen3:8b",
      provider: "ollama",
      config: prValidatorConfig,
      tags: ["github", "review"],
    },
  });
  console.log(`Seeded agent: ${prValidator.name} (${prValidator.id})`);

  const prCloserConfig = {
    system_prompt: [
      "You are responsible for finalizing a pull request.",
      "",
      "Your job:",
      "1. The PR has been validated and approved by the previous agent.",
      "2. Add an approving review comment summarizing what was fixed.",
      "3. Merge the pull request using the merge tool.",
      "",
      "Keep the review comment concise — 2-3 sentences summarizing the fix.",
      "Use 'squash' merge strategy if available.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 2048,
    memory_enabled: false,
    gateway_permissions: githubWritePerms(mergerTools),
  };

  const prCloser = await prisma.agent.upsert({
    where: { id: "pr-closer-001" },
    update: { config: prCloserConfig },
    create: {
      id: "pr-closer-001",
      name: "PR Closer",
      description: "Adds review comment and merges the PR.",
      model: "qwen3:8b",
      provider: "ollama",
      config: prCloserConfig,
      tags: ["github", "merge"],
    },
  });
  console.log(`Seeded agent: ${prCloser.name} (${prCloser.id})`);

  // ── PR Resolution Graph ──

  const prResolverGraph = await prisma.graph.upsert({
    where: { id: "pr-resolver-001" },
    update: {},
    create: {
      id: "pr-resolver-001",
      name: "PR Resolver",
      description:
        "End-to-end PR resolution: analyze → design fix → implement → validate → merge. Loops back on validation failure.",
      nodes: [
        {
          id: "node-start",
          type: "start",
          position: { x: 250, y: 0 },
          data: { label: "Start", type: "start" },
        },
        {
          id: "node-analyzer",
          type: "agent",
          position: { x: 250, y: 120 },
          data: {
            label: "PR Analyzer",
            type: "agent",
            agent_id: prAnalyzer.id,
          },
        },
        {
          id: "node-designer",
          type: "agent",
          position: { x: 250, y: 240 },
          data: {
            label: "Solution Designer",
            type: "agent",
            agent_id: prSolution.id,
          },
        },
        {
          id: "node-approval",
          type: "approval",
          position: { x: 250, y: 310 },
          data: {
            label: "Human Review",
            type: "approval",
            config: {
              approvalTimeout: 3600,
              message:
                "Review the fix plan above. Approve to let the agents commit code to the PR, or reject to stop.",
            },
          },
        },
        {
          id: "node-fixer",
          type: "agent",
          position: { x: 250, y: 400 },
          data: {
            label: "Code Fixer",
            type: "agent",
            agent_id: prFixer.id,
          },
        },
        {
          id: "node-validator",
          type: "agent",
          position: { x: 250, y: 480 },
          data: {
            label: "Validator",
            type: "agent",
            agent_id: prValidator.id,
          },
        },
        {
          id: "node-check",
          type: "condition",
          position: { x: 250, y: 600 },
          data: { label: "Pass?", type: "condition" },
        },
        {
          id: "node-closer",
          type: "agent",
          position: { x: 450, y: 700 },
          data: {
            label: "PR Closer",
            type: "agent",
            agent_id: prCloser.id,
          },
        },
        {
          id: "node-end",
          type: "end",
          position: { x: 450, y: 820 },
          data: { label: "End", type: "end" },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-start",
          target: "node-analyzer",
          type: "execution",
          data: {},
        },
        {
          id: "edge-2",
          source: "node-analyzer",
          target: "node-designer",
          type: "execution",
          data: {},
        },
        {
          id: "edge-3",
          source: "node-designer",
          target: "node-approval",
          type: "execution",
          data: {},
        },
        {
          id: "edge-3b",
          source: "node-approval",
          target: "node-fixer",
          type: "execution",
          data: {},
        },
        {
          id: "edge-4",
          source: "node-fixer",
          target: "node-validator",
          type: "execution",
          data: {},
        },
        {
          id: "edge-5",
          source: "node-validator",
          target: "node-check",
          type: "execution",
          data: {},
        },
        {
          id: "edge-6",
          source: "node-check",
          target: "node-closer",
          type: "execution",
          data: { condition: '"PASS" in node_validator_response' },
        },
        {
          id: "edge-7",
          source: "node-check",
          target: "node-fixer",
          type: "execution",
          data: { condition: "default" },
        },
        {
          id: "edge-8",
          source: "node-closer",
          target: "node-end",
          type: "execution",
          data: {},
        },
      ],
    },
  });
  console.log(`Seeded graph: ${prResolverGraph.name} (${prResolverGraph.id})`);

  // ── Issue Resolution Pipeline agents ──

  const issueAnalyzerConfig = {
    system_prompt: [
      "You are a GitHub issue analysis specialist. You receive an issue URL or reference.",
      "",
      "IMPORTANT: You MUST call your tools to fetch real data. Do NOT guess or describe what you would do.",
      "Your tools have prefixed names (e.g. abc12345_get_issue) — use them as-is.",
      "",
      "Your job:",
      "1. If given a repo name without owner, call the search_repositories tool to find it.",
      "2. Call the get_issue tool with the owner, repo, and issue number to fetch the full issue details.",
      "3. If the issue references other issues or PRs, fetch those too.",
      "",
      "Output a structured analysis:",
      "- **Repository**: owner/repo",
      "- **Issue**: #number — title",
      "- **Problem**: Clear description of what's wrong or what's requested.",
      "- **Type**: bug / feature / enhancement / refactor",
      "- **Requirements**: What the fix must satisfy (from issue body + comments).",
      "- **Hints**: Any code pointers, stack traces, or reproduction steps mentioned.",
      "",
      "Be thorough — the next agent will explore the codebase based on your analysis.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(analyzerTools),
  };

  const issueAnalyzer = await prisma.agent.upsert({
    where: { id: "issue-analyzer-001" },
    update: { config: issueAnalyzerConfig },
    create: {
      id: "issue-analyzer-001",
      name: "Issue Analyzer",
      description: "Reads GitHub issue details and produces a structured problem analysis.",
      model: "qwen3:8b",
      provider: "ollama",
      config: issueAnalyzerConfig,
      tags: ["github", "analysis"],
    },
  });
  console.log(`Seeded agent: ${issueAnalyzer.name} (${issueAnalyzer.id})`);

  const codeExplorerConfig = {
    system_prompt: [
      "You are a codebase exploration specialist. You receive an issue analysis from the previous agent.",
      "",
      "IMPORTANT: You MUST call your tools to fetch real data. Do NOT describe what you would do — actually call the tools.",
      "Your tools have prefixed names (e.g. abc12345_search_code) — use them as-is.",
      "",
      "Your job:",
      "1. Call the search_code tool to find files related to the issue (use keywords from the issue analysis).",
      "2. Call get_file_contents to read the full source of each relevant file found.",
      "3. Call list_commits to check recent changes to those files.",
      "",
      "Output your findings:",
      "- **Relevant files**: List each file with a summary of what it does and why it's relevant.",
      "- **Key code sections**: Quote the specific code blocks that need attention.",
      "- **Dependencies**: Other files/modules that interact with the affected code.",
      "- **Default branch**: The main/master branch name.",
      "",
      "Be precise — quote actual code, not paraphrased descriptions.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(explorerTools),
  };

  const codeExplorer = await prisma.agent.upsert({
    where: { id: "issue-explorer-001" },
    update: { config: codeExplorerConfig },
    create: {
      id: "issue-explorer-001",
      name: "Codebase Explorer",
      description: "Explores the repository to find files and code relevant to the issue.",
      model: "qwen3:8b",
      provider: "ollama",
      config: codeExplorerConfig,
      tags: ["github", "exploration"],
    },
  });
  console.log(`Seeded agent: ${codeExplorer.name} (${codeExplorer.id})`);

  const issueSolutionConfig = {
    system_prompt: [
      "You are a solution architect. You receive an issue analysis and codebase exploration results.",
      "",
      "IMPORTANT: You MUST call your tools to read the actual code before designing a fix.",
      "Your tools have prefixed names (e.g. abc12345_get_file_contents) — use them as-is.",
      "",
      "Your job:",
      "1. Understand the problem from the issue analysis.",
      "2. Call get_file_contents to read the actual source files that need changes.",
      "3. Design a precise, minimal fix that addresses the issue requirements.",
      "",
      "Output a detailed solution plan:",
      "- **Branch name**: A descriptive branch name (e.g., fix/issue-42-null-check).",
      "- **Approach**: High-level strategy (1-2 sentences).",
      "- **Changes**: For each file, specify exact modifications:",
      "  - File path",
      "  - What to change (old code → new code, or new code to add)",
      "  - Why this change is needed",
      "- **Commit message**: A clear conventional commit message.",
      "- **PR title**: Short PR title.",
      "- **PR body**: Markdown body that references the issue (Fixes #N).",
      "",
      "Be specific enough that the next agent can implement without ambiguity.",
    ].join("\n"),
    temperature: 0.3,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(designerTools),
  };

  const issueSolution = await prisma.agent.upsert({
    where: { id: "issue-solution-001" },
    update: { config: issueSolutionConfig },
    create: {
      id: "issue-solution-001",
      name: "Issue Solution Designer",
      description: "Designs a fix plan with branch name, changes, commit message, and PR template.",
      model: "qwen3:8b",
      provider: "ollama",
      config: issueSolutionConfig,
      tags: ["github", "architecture"],
    },
  });
  console.log(`Seeded agent: ${issueSolution.name} (${issueSolution.id})`);

  const issueImplementerConfig = {
    system_prompt: [
      "You are a code implementation specialist. You receive a solution plan from the previous agent.",
      "",
      "IMPORTANT: You MUST call your tools to implement changes. Do NOT just describe what you would do.",
      "Your tools have prefixed names (e.g. abc12345_create_branch) — use them as-is.",
      "",
      "Your job — execute these steps BY CALLING TOOLS:",
      "1. Call create_branch to create a new branch (owner, repo, branch name, from_ref='main').",
      "2. Call get_file_contents to read each file that needs changes.",
      "3. Call create_or_update_file to write the modified file to the new branch.",
      "4. Call create_pull_request to open a PR (owner, repo, title, body, head=branch, base='main').",
      "",
      "RULES:",
      "- Always read files before modifying them.",
      "- If this is a RETRY after failed validation, fix only the issues mentioned. Push to the SAME branch.",
      "",
      "End your response with:",
      "- BRANCH: <branch-name>",
      "- PR_NUMBER: <number> (or EXISTING if retrying)",
      "- CHANGES_COMMITTED: true/false",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubWritePerms(implementerTools),
  };

  const issueImplementer = await prisma.agent.upsert({
    where: { id: "issue-implementer-001" },
    update: { config: issueImplementerConfig },
    create: {
      id: "issue-implementer-001",
      name: "Issue Implementer",
      description: "Creates branch, implements changes, and opens a PR for the issue fix.",
      model: "qwen3:8b",
      provider: "ollama",
      config: issueImplementerConfig,
      tags: ["github", "implementation"],
    },
  });
  console.log(`Seeded agent: ${issueImplementer.name} (${issueImplementer.id})`);

  const issueValidatorConfig = {
    system_prompt: [
      "You are a code review and validation specialist.",
      "",
      "IMPORTANT: You MUST call your tools to review the actual changes. Do NOT guess.",
      "Your tools have prefixed names (e.g. abc12345_get_pull_request) — use them as-is.",
      "",
      "Your job:",
      "1. Call get_pull_request to fetch the PR details (look for the PR number in the previous agent output).",
      "2. Call get_pull_request_files to see which files were changed and their diffs.",
      "3. Call get_file_contents to read the full modified files if needed.",
      "4. Check for: syntax errors, missing imports, broken logic, edge cases, security issues.",
      "",
      "Output your review:",
      "- **Review**: File-by-file assessment of the changes.",
      "- **Issues found**: List any problems (or 'None').",
      "- **Missing**: Anything the fix should have addressed but didn't.",
      "",
      "CRITICAL: End your response with exactly one of:",
      "- VERDICT: PASS — if the fix is correct and complete",
      "- VERDICT: FAIL — if there are issues that need fixing (explain what)",
      "",
      "Be strict but fair. Only PASS if you're confident the fix is correct.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 4096,
    memory_enabled: false,
    gateway_permissions: githubReadPerms(validatorTools),
  };

  const issueValidator = await prisma.agent.upsert({
    where: { id: "issue-validator-001" },
    update: { config: issueValidatorConfig },
    create: {
      id: "issue-validator-001",
      name: "Issue Validator",
      description: "Reviews the PR changes and validates correctness against the issue.",
      model: "qwen3:8b",
      provider: "ollama",
      config: issueValidatorConfig,
      tags: ["github", "review"],
    },
  });
  console.log(`Seeded agent: ${issueValidator.name} (${issueValidator.id})`);

  const issueMergerConfig = {
    system_prompt: [
      "You are responsible for finalizing the issue resolution.",
      "",
      "Your job:",
      "1. The PR has been validated and approved by the previous agent.",
      "2. Add an approving review comment summarizing the fix.",
      "3. Merge the pull request (squash merge preferred).",
      "4. Add a comment on the original issue confirming it's fixed with a link to the merged PR.",
      "",
      "Keep comments concise — 2-3 sentences each.",
    ].join("\n"),
    temperature: 0.2,
    max_tokens: 2048,
    memory_enabled: false,
    gateway_permissions: githubWritePerms(mergerTools),
  };

  const issueMerger = await prisma.agent.upsert({
    where: { id: "issue-merger-001" },
    update: { config: issueMergerConfig },
    create: {
      id: "issue-merger-001",
      name: "Issue Merger",
      description: "Merges the PR and comments on the issue confirming resolution.",
      model: "qwen3:8b",
      provider: "ollama",
      config: issueMergerConfig,
      tags: ["github", "merge"],
    },
  });
  console.log(`Seeded agent: ${issueMerger.name} (${issueMerger.id})`);

  // ── Issue Resolution Graph ──

  const issueResolverDesc =
    "Resolve a GitHub issue end-to-end: analyze issue → explore codebase → design fix → create branch & PR → validate → merge. Use this when asked to resolve, fix, or address a GitHub issue.";

  const issueResolverNodes = [
    {
      id: "node-start",
      type: "start",
      position: { x: 250, y: 0 },
      data: { label: "Start", type: "start" },
    },
    {
      id: "node-analyzer",
      type: "agent",
      position: { x: 250, y: 100 },
      data: { label: "Issue Analyzer", type: "agent", agent_id: issueAnalyzer.id },
    },
    {
      id: "node-review-analysis",
      type: "approval",
      position: { x: 250, y: 200 },
      data: {
        label: "Review Analysis",
        type: "approval",
        config: {
          approvalTimeout: 3600,
          message: "Review the issue analysis above. Approve to continue exploring the codebase, or reject to stop.",
        },
      },
    },
    {
      id: "node-explorer",
      type: "agent",
      position: { x: 250, y: 300 },
      data: { label: "Codebase Explorer", type: "agent", agent_id: codeExplorer.id },
    },
    {
      id: "node-review-exploration",
      type: "approval",
      position: { x: 250, y: 400 },
      data: {
        label: "Review Exploration",
        type: "approval",
        config: {
          approvalTimeout: 3600,
          message: "Review the codebase exploration above. Approve to continue to solution design, or reject to stop.",
        },
      },
    },
    {
      id: "node-designer",
      type: "agent",
      position: { x: 250, y: 500 },
      data: { label: "Solution Designer", type: "agent", agent_id: issueSolution.id },
    },
    {
      id: "node-review-design",
      type: "approval",
      position: { x: 250, y: 600 },
      data: {
        label: "Review Design",
        type: "approval",
        config: {
          approvalTimeout: 3600,
          message: "Review the implementation plan above. Approve to let the agents create a branch and commit code, or reject to stop.",
        },
      },
    },
    {
      id: "node-implementer",
      type: "agent",
      position: { x: 250, y: 700 },
      data: { label: "Implementer", type: "agent", agent_id: issueImplementer.id },
    },
    {
      id: "node-validator",
      type: "agent",
      position: { x: 250, y: 800 },
      data: { label: "Validator", type: "agent", agent_id: issueValidator.id },
    },
    {
      id: "node-check",
      type: "condition",
      position: { x: 250, y: 900 },
      data: { label: "Pass?", type: "condition" },
    },
    {
      id: "node-review-merge",
      type: "approval",
      position: { x: 450, y: 1000 },
      data: {
        label: "Review & Merge",
        type: "approval",
        config: {
          approvalTimeout: 3600,
          message: "Validation passed. Review the changes and approve to merge the PR, or reject to stop.",
        },
      },
    },
    {
      id: "node-merger",
      type: "agent",
      position: { x: 450, y: 1100 },
      data: { label: "Merger", type: "agent", agent_id: issueMerger.id },
    },
    {
      id: "node-end",
      type: "end",
      position: { x: 450, y: 1200 },
      data: { label: "End", type: "end" },
    },
  ];

  const issueResolverEdges = [
    { id: "edge-1", source: "node-start", target: "node-analyzer", type: "execution", data: {} },
    { id: "edge-2", source: "node-analyzer", target: "node-review-analysis", type: "execution", data: {} },
    { id: "edge-3", source: "node-review-analysis", target: "node-explorer", type: "execution", data: {} },
    { id: "edge-4", source: "node-explorer", target: "node-review-exploration", type: "execution", data: {} },
    { id: "edge-5", source: "node-review-exploration", target: "node-designer", type: "execution", data: {} },
    { id: "edge-6", source: "node-designer", target: "node-review-design", type: "execution", data: {} },
    { id: "edge-7", source: "node-review-design", target: "node-implementer", type: "execution", data: {} },
    { id: "edge-8", source: "node-implementer", target: "node-validator", type: "execution", data: {} },
    { id: "edge-9", source: "node-validator", target: "node-check", type: "execution", data: {} },
    { id: "edge-10", source: "node-check", target: "node-review-merge", type: "execution", data: { condition: '"PASS" in node_validator_response' } },
    { id: "edge-11", source: "node-check", target: "node-implementer", type: "execution", data: { condition: "default" } },
    { id: "edge-12", source: "node-review-merge", target: "node-merger", type: "execution", data: {} },
    { id: "edge-13", source: "node-merger", target: "node-end", type: "execution", data: {} },
  ];

  const issueResolverGraph = await prisma.graph.upsert({
    where: { id: "issue-resolver-001" },
    update: {
      description: issueResolverDesc,
      nodes: issueResolverNodes,
      edges: issueResolverEdges,
    },
    create: {
      id: "issue-resolver-001",
      name: "Issue Resolver",
      description: issueResolverDesc,
      nodes: issueResolverNodes,
      edges: issueResolverEdges,
    },
  });
  console.log(`Seeded graph: ${issueResolverGraph.name} (${issueResolverGraph.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
