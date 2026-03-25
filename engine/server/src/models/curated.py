"""Curated model lists for the model catalog.

These lists provide browsable model options for admins adding models to the catalog.
Ollama models use a curated list of popular/recommended models.
Cloud models use known model IDs from each provider's documentation.

Models are organized by use case for agent workflows:
- Lightweight: for low-resource machines (< 8GB VRAM)
- Agent Workers: balanced speed/quality for task execution (8-16GB VRAM)
- Orchestrators: strong reasoning for supervisors/routers (16GB+ VRAM)
- Code Specialists: optimized for code generation/analysis
- Vision / Embedding: specialized capabilities
"""

CURATED_OLLAMA_MODELS: list[dict] = [
    # ================================================================
    # LIGHTWEIGHT — Low-resource machines, edge deployment
    # Good as simple workers, quick tasks, or on CPU-only setups
    # ================================================================
    {
        "model_name": "qwen3:0.6b",
        "display_name": "Qwen3 0.6B",
        "family": "qwen",
        "size": "0.6B",
        "disk_size": "0.5 GB",
        "context_window": 32768,
        "capabilities": {"chat": True, "function_calling": True},
    },
    {
        "model_name": "llama3.2:1b",
        "display_name": "Llama 3.2 1B",
        "family": "llama",
        "size": "1B",
        "disk_size": "1.3 GB",
        "context_window": 128000,
        "capabilities": {"chat": True},
    },
    {
        "model_name": "qwen3:1.7b",
        "display_name": "Qwen3 1.7B",
        "family": "qwen",
        "size": "1.7B",
        "disk_size": "1.1 GB",
        "context_window": 32768,
        "capabilities": {"chat": True, "function_calling": True},
    },
    {
        "model_name": "gemma2:2b",
        "display_name": "Gemma 2 2B",
        "family": "gemma",
        "size": "2B",
        "disk_size": "1.6 GB",
        "context_window": 8192,
        "capabilities": {"chat": True},
    },
    {
        "model_name": "phi3:latest",
        "display_name": "Phi-3",
        "family": "phi",
        "size": "3.8B",
        "disk_size": "2.3 GB",
        "context_window": 128000,
        "capabilities": {"chat": True},
    },
    {
        "model_name": "llama3.2:latest",
        "display_name": "Llama 3.2",
        "family": "llama",
        "size": "3B",
        "disk_size": "2.0 GB",
        "context_window": 128000,
        "capabilities": {"chat": True, "code": True},
    },
    {
        "model_name": "qwen3:4b",
        "display_name": "Qwen3 4B",
        "family": "qwen",
        "size": "4B",
        "disk_size": "2.6 GB",
        "context_window": 32768,
        "capabilities": {"chat": True, "code": True, "function_calling": True},
    },
    # ================================================================
    # AGENT WORKERS — Best balance of speed & quality for task execution
    # Sweet spot for tool calling, RAG retrieval, single-task agents
    # ================================================================
    {
        "model_name": "qwen3:8b",
        "display_name": "Qwen3 8B",
        "family": "qwen",
        "size": "8B",
        "disk_size": "5.2 GB",
        "context_window": 32768,
        "capabilities": {"chat": True, "code": True, "function_calling": True},
    },
    {
        "model_name": "glm4:latest",
        "display_name": "GLM-4 9B",
        "family": "glm",
        "size": "9B",
        "disk_size": "5.5 GB",
        "context_window": 128000,
        "capabilities": {"chat": True, "code": True, "function_calling": True},
    },
    {
        "model_name": "mistral:latest",
        "display_name": "Mistral 7B",
        "family": "mistral",
        "size": "7B",
        "disk_size": "4.1 GB",
        "context_window": 32000,
        "capabilities": {"chat": True},
    },
    {
        "model_name": "gemma2:latest",
        "display_name": "Gemma 2 9B",
        "family": "gemma",
        "size": "9B",
        "disk_size": "5.4 GB",
        "context_window": 8192,
        "capabilities": {"chat": True},
    },
    {
        "model_name": "qwen2.5:latest",
        "display_name": "Qwen 2.5 7B",
        "family": "qwen",
        "size": "7B",
        "disk_size": "4.7 GB",
        "context_window": 128000,
        "capabilities": {"chat": True, "code": True},
    },
    {
        "model_name": "devstral:latest",
        "display_name": "Devstral",
        "family": "mistral",
        "size": "24B",
        "disk_size": "14 GB",
        "context_window": 128000,
        "capabilities": {"code": True, "function_calling": True},
    },
    # ================================================================
    # ORCHESTRATORS / SUPERVISORS — Strong reasoning for routing & planning
    # Use as team supervisor, graph orchestrator, or complex decision-making
    # ================================================================
    {
        "model_name": "qwen3:14b",
        "display_name": "Qwen3 14B",
        "family": "qwen",
        "size": "14B",
        "disk_size": "9.0 GB",
        "context_window": 32768,
        "capabilities": {
            "chat": True,
            "code": True,
            "function_calling": True,
            "reasoning": True,
        },
    },
    {
        "model_name": "phi4:latest",
        "display_name": "Phi-4",
        "family": "phi",
        "size": "14B",
        "disk_size": "9.1 GB",
        "context_window": 16384,
        "capabilities": {"chat": True, "reasoning": True},
    },
    {
        "model_name": "qwen3:30b-a3b",
        "display_name": "Qwen3 30B-A3B (MoE)",
        "family": "qwen",
        "size": "30B",
        "disk_size": "18 GB",
        "context_window": 32768,
        "capabilities": {
            "chat": True,
            "code": True,
            "function_calling": True,
            "reasoning": True,
        },
    },
    {
        "model_name": "qwen2.5:14b",
        "display_name": "Qwen 2.5 14B",
        "family": "qwen",
        "size": "14B",
        "disk_size": "9.0 GB",
        "context_window": 128000,
        "capabilities": {"chat": True, "code": True},
    },
    {
        "model_name": "qwen2.5:32b",
        "display_name": "Qwen 2.5 32B",
        "family": "qwen",
        "size": "32B",
        "disk_size": "20 GB",
        "context_window": 128000,
        "capabilities": {"chat": True, "code": True, "function_calling": True},
    },
    {
        "model_name": "qwen3:32b",
        "display_name": "Qwen3 32B",
        "family": "qwen",
        "size": "32B",
        "disk_size": "20 GB",
        "context_window": 32768,
        "capabilities": {
            "chat": True,
            "code": True,
            "function_calling": True,
            "reasoning": True,
        },
    },
    {
        "model_name": "mixtral:latest",
        "display_name": "Mixtral 8x7B",
        "family": "mistral",
        "size": "47B",
        "disk_size": "26 GB",
        "context_window": 32000,
        "capabilities": {"chat": True},
    },
    {
        "model_name": "llama3.3:latest",
        "display_name": "Llama 3.3 70B",
        "family": "llama",
        "size": "70B",
        "disk_size": "43 GB",
        "context_window": 128000,
        "capabilities": {"chat": True, "code": True, "function_calling": True},
    },
    # ================================================================
    # REASONING — Deep thinking for complex analysis
    # ================================================================
    {
        "model_name": "deepseek-r1:latest",
        "display_name": "DeepSeek R1 7B",
        "family": "deepseek",
        "size": "7B",
        "disk_size": "4.7 GB",
        "context_window": 64000,
        "capabilities": {"chat": True, "code": True, "reasoning": True},
    },
    {
        "model_name": "deepseek-r1:14b",
        "display_name": "DeepSeek R1 14B",
        "family": "deepseek",
        "size": "14B",
        "disk_size": "9.0 GB",
        "context_window": 64000,
        "capabilities": {"chat": True, "code": True, "reasoning": True},
    },
    {
        "model_name": "deepseek-r1:32b",
        "display_name": "DeepSeek R1 32B",
        "family": "deepseek",
        "size": "32B",
        "disk_size": "20 GB",
        "context_window": 64000,
        "capabilities": {"chat": True, "code": True, "reasoning": True},
    },
    # ================================================================
    # CODE SPECIALISTS — Optimized for code generation & analysis
    # ================================================================
    {
        "model_name": "qwen2.5-coder:latest",
        "display_name": "Qwen 2.5 Coder 7B",
        "family": "qwen",
        "size": "7B",
        "disk_size": "4.7 GB",
        "context_window": 32768,
        "capabilities": {"code": True},
    },
    {
        "model_name": "qwen2.5-coder:1.5b",
        "display_name": "Qwen 2.5 Coder 1.5B",
        "family": "qwen",
        "size": "1.5B",
        "disk_size": "1.0 GB",
        "context_window": 32768,
        "capabilities": {"code": True},
    },
    {
        "model_name": "codellama:latest",
        "display_name": "Code Llama 7B",
        "family": "llama",
        "size": "7B",
        "disk_size": "3.8 GB",
        "context_window": 16384,
        "capabilities": {"code": True},
    },
    {
        "model_name": "starcoder2:latest",
        "display_name": "StarCoder2 3B",
        "family": "starcoder",
        "size": "3B",
        "disk_size": "1.7 GB",
        "context_window": 16384,
        "capabilities": {"code": True},
    },
    # ================================================================
    # VISION — Multimodal (image understanding)
    # ================================================================
    {
        "model_name": "llava:latest",
        "display_name": "LLaVA 7B",
        "family": "llava",
        "size": "7B",
        "disk_size": "4.5 GB",
        "context_window": 4096,
        "capabilities": {"chat": True, "vision": True},
    },
    {
        "model_name": "llava:13b",
        "display_name": "LLaVA 13B",
        "family": "llava",
        "size": "13B",
        "disk_size": "8.0 GB",
        "context_window": 4096,
        "capabilities": {"chat": True, "vision": True},
    },
    # ================================================================
    # EMBEDDING — For RAG vector search
    # ================================================================
    {
        "model_name": "nomic-embed-text",
        "display_name": "Nomic Embed Text",
        "family": "nomic",
        "size": "137M",
        "disk_size": "274 MB",
        "context_window": 8192,
        "capabilities": {"embedding": True},
    },
    {
        "model_name": "mxbai-embed-large",
        "display_name": "mxbai Embed Large",
        "family": "mxbai",
        "size": "335M",
        "disk_size": "670 MB",
        "context_window": 512,
        "capabilities": {"embedding": True},
    },
    {
        "model_name": "all-minilm",
        "display_name": "All-MiniLM-L6",
        "family": "minilm",
        "size": "23M",
        "disk_size": "45 MB",
        "context_window": 256,
        "capabilities": {"embedding": True},
    },
]

CURATED_CLOUD_MODELS: dict[str, list[dict]] = {
    "openai": [
        {
            "model_name": "gpt-4o",
            "display_name": "GPT-4o",
            "context_window": 128000,
            "max_output_tokens": 16384,
            "capabilities": {"chat": True, "vision": True, "function_calling": True},
        },
        {
            "model_name": "gpt-4o-mini",
            "display_name": "GPT-4o Mini",
            "context_window": 128000,
            "max_output_tokens": 16384,
            "capabilities": {"chat": True, "vision": True, "function_calling": True},
        },
        {
            "model_name": "o1",
            "display_name": "o1",
            "context_window": 200000,
            "max_output_tokens": 100000,
            "capabilities": {"chat": True, "reasoning": True},
        },
        {
            "model_name": "o3-mini",
            "display_name": "o3 Mini",
            "context_window": 200000,
            "max_output_tokens": 100000,
            "capabilities": {"chat": True, "reasoning": True},
        },
    ],
    "anthropic": [
        {
            "model_name": "claude-opus-4-6",
            "display_name": "Claude Opus 4.6",
            "context_window": 1000000,
            "max_output_tokens": 128000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "claude-sonnet-4-6",
            "display_name": "Claude Sonnet 4.6",
            "context_window": 1000000,
            "max_output_tokens": 128000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "claude-opus-4-5-20251101",
            "display_name": "Claude Opus 4.5",
            "context_window": 200000,
            "max_output_tokens": 64000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "claude-sonnet-4-5-20250929",
            "display_name": "Claude Sonnet 4.5",
            "context_window": 1000000,
            "max_output_tokens": 64000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "claude-haiku-4-5-20251001",
            "display_name": "Claude Haiku 4.5",
            "context_window": 200000,
            "max_output_tokens": 64000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "claude-opus-4-20250514",
            "display_name": "Claude Opus 4",
            "context_window": 200000,
            "max_output_tokens": 32000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "claude-sonnet-4-20250514",
            "display_name": "Claude Sonnet 4",
            "context_window": 1000000,
            "max_output_tokens": 64000,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "code": True,
            },
        },
    ],
    "google": [
        {
            "model_name": "gemini-2.0-flash",
            "display_name": "Gemini 2.0 Flash",
            "context_window": 1048576,
            "max_output_tokens": 8192,
            "capabilities": {"chat": True, "vision": True, "function_calling": True},
        },
        {
            "model_name": "gemini-2.5-pro-preview-05-06",
            "display_name": "Gemini 2.5 Pro",
            "context_window": 1048576,
            "max_output_tokens": 65536,
            "capabilities": {
                "chat": True,
                "vision": True,
                "function_calling": True,
                "reasoning": True,
            },
        },
        {
            "model_name": "gemini-1.5-pro",
            "display_name": "Gemini 1.5 Pro",
            "context_window": 2097152,
            "max_output_tokens": 8192,
            "capabilities": {"chat": True, "vision": True, "function_calling": True},
        },
    ],
    "mistral": [
        {
            "model_name": "mistral-large-latest",
            "display_name": "Mistral Large",
            "context_window": 128000,
            "max_output_tokens": 4096,
            "capabilities": {"chat": True, "function_calling": True},
        },
        {
            "model_name": "mistral-small-latest",
            "display_name": "Mistral Small",
            "context_window": 128000,
            "max_output_tokens": 4096,
            "capabilities": {"chat": True, "function_calling": True},
        },
        {
            "model_name": "codestral-latest",
            "display_name": "Codestral",
            "context_window": 32000,
            "max_output_tokens": 4096,
            "capabilities": {"code": True, "function_calling": True},
        },
    ],
    "cohere": [
        {
            "model_name": "command-r-plus",
            "display_name": "Command R+",
            "context_window": 128000,
            "max_output_tokens": 4096,
            "capabilities": {"chat": True, "function_calling": True},
        },
        {
            "model_name": "command-r",
            "display_name": "Command R",
            "context_window": 128000,
            "max_output_tokens": 4096,
            "capabilities": {"chat": True, "function_calling": True},
        },
    ],
    "groq": [
        {
            "model_name": "llama-3.3-70b-versatile",
            "display_name": "Llama 3.3 70B",
            "context_window": 128000,
            "max_output_tokens": 32768,
            "capabilities": {"chat": True, "code": True, "function_calling": True},
        },
        {
            "model_name": "llama-3.1-8b-instant",
            "display_name": "Llama 3.1 8B Instant",
            "context_window": 128000,
            "max_output_tokens": 8192,
            "capabilities": {"chat": True, "function_calling": True},
        },
        {
            "model_name": "mixtral-8x7b-32768",
            "display_name": "Mixtral 8x7B",
            "context_window": 32768,
            "max_output_tokens": 4096,
            "capabilities": {"chat": True},
        },
    ],
}
