"""MCP Server Catalog — known MCP servers with pre-configured settings.

Each entry defines how to deploy a stdio-based MCP server via mcp-proxy sidecar.
The runtime uses this to auto-provision Docker containers when users "Add from Catalog".
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class MCPCategory(StrEnum):
    """Valid categories for MCP catalog entries."""

    SEARCH = "search"
    COMMUNICATION = "communication"
    PRODUCTIVITY = "productivity"
    DATABASE = "database"
    PROJECT_MANAGEMENT = "project-management"
    DEVELOPMENT = "development"
    UTILITY = "utility"
    DEVOPS = "devops"
    AI = "ai"
    AUTOMATION = "automation"
    FINANCE = "finance"
    DATA_ANALYTICS = "data-analytics"


class MCPCatalogEntry(BaseModel):
    """A known MCP server available for one-click deployment."""

    id: str = Field(..., description="Unique catalog identifier (slug)")
    name: str
    description: str
    category: MCPCategory = Field(..., description="Category for UI grouping")
    icon: str = Field(..., description="Lucide icon name for dashboard UI")
    npm_package: str | None = Field(None, description="npm package to run via npx")
    docker_image: str | None = Field(None, description="Custom Docker image name")
    server_command: list[str] | None = Field(
        None, description="Command to run the MCP server inside the container"
    )
    mem_limit: str | None = Field(None, description="Docker memory limit override (e.g. '512m')")
    volumes: dict[str, dict] | None = Field(None, description="Docker volume mounts")
    default_env: dict[str, str] | None = Field(
        None, description="Default environment variables injected at deploy time"
    )
    required_secrets: list[CatalogSecret] = Field(default_factory=list)
    default_args: list[str] = Field(default_factory=list)
    documentation_url: str | None = None
    setup_flow: str | None = Field(
        None, description="Post-deploy setup flow type: 'qr-code' or None"
    )

    @model_validator(mode="after")
    def _check_runtime(self):
        if self.npm_package is None and self.docker_image is None:
            raise ValueError("At least one of npm_package or docker_image must be set")
        if self.server_command is not None and self.docker_image is None:
            raise ValueError("server_command requires docker_image to be set")
        if (
            self.docker_image is not None
            and self.npm_package is None
            and self.server_command is None
        ):
            raise ValueError(
                "server_command is required when docker_image is set without npm_package"
            )
        return self


class CatalogSecret(BaseModel):
    """A secret/env var the user must provide to deploy this server."""

    key: str = Field(..., description="Environment variable name")
    label: str = Field(..., description="Human-readable label for UI")
    placeholder: str = ""
    required: bool = True
    is_secret: bool = Field(
        True, description="When False, dashboard renders as text input instead of password"
    )


# ---------------------------------------------------------------------------
# Catalog data
# ---------------------------------------------------------------------------

MCP_CATALOG: list[MCPCatalogEntry] = [
    MCPCatalogEntry(
        id="slack",
        name="Slack",
        description="Send and read Slack messages, manage channels",
        category="communication",
        icon="message-square",
        npm_package="@modelcontextprotocol/server-slack",
        required_secrets=[
            CatalogSecret(key="SLACK_BOT_TOKEN", label="Slack Bot Token", placeholder="xoxb-..."),
        ],
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    MCPCatalogEntry(
        id="google-drive",
        name="Google Drive",
        description="Search and read files from Google Drive",
        category="productivity",
        icon="hard-drive",
        npm_package="@modelcontextprotocol/server-gdrive",
        required_secrets=[
            CatalogSecret(key="GOOGLE_CLIENT_ID", label="Google OAuth Client ID"),
            CatalogSecret(key="GOOGLE_CLIENT_SECRET", label="Google OAuth Client Secret"),
        ],
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    MCPCatalogEntry(
        id="gmail",
        name="Gmail",
        description="Read, send, and manage emails via Gmail",
        category="communication",
        icon="mail",
        npm_package="@gongrzhe/server-gmail-autoauth-mcp",
        required_secrets=[
            CatalogSecret(key="GOOGLE_CLIENT_ID", label="Google OAuth Client ID"),
            CatalogSecret(key="GOOGLE_CLIENT_SECRET", label="Google OAuth Client Secret"),
        ],
        documentation_url="https://github.com/gongrzhe/server-gmail-autoauth-mcp",
    ),
    MCPCatalogEntry(
        id="google-calendar",
        name="Google Calendar",
        description="Manage calendar events and schedules",
        category="productivity",
        icon="calendar",
        npm_package="@cocal/google-calendar-mcp",
        required_secrets=[
            CatalogSecret(key="GOOGLE_CLIENT_ID", label="Google OAuth Client ID"),
            CatalogSecret(key="GOOGLE_CLIENT_SECRET", label="Google OAuth Client Secret"),
        ],
        documentation_url="https://github.com/cocal/google-calendar-mcp",
    ),
    MCPCatalogEntry(
        id="notion",
        name="Notion",
        description="Search and manage Notion pages and databases",
        category="productivity",
        icon="book-open",
        npm_package="@notionhq/notion-mcp-server",
        required_secrets=[
            CatalogSecret(
                key="NOTION_API_KEY", label="Notion Integration Token", placeholder="ntn_..."
            ),
        ],
        documentation_url="https://github.com/notionhq/notion-mcp-server",
    ),
    MCPCatalogEntry(
        id="postgres",
        name="PostgreSQL",
        description="Query PostgreSQL databases with read-only access",
        category="database",
        icon="database",
        npm_package="@modelcontextprotocol/server-postgres",
        required_secrets=[
            CatalogSecret(
                key="POSTGRES_URL",
                label="PostgreSQL Connection URL",
                placeholder="postgresql://user:pass@host:5432/db",
            ),
        ],
    ),
    MCPCatalogEntry(
        id="linear",
        name="Linear",
        description="Create and manage Linear issues and projects",
        category="project-management",
        icon="kanban",
        npm_package="@mseep/linear-mcp",
        required_secrets=[
            CatalogSecret(key="LINEAR_API_KEY", label="Linear API Key"),
        ],
        documentation_url="https://github.com/mseep/linear-mcp",
    ),
    MCPCatalogEntry(
        id="jira",
        name="Jira",
        description="Create and manage Jira issues",
        category="project-management",
        icon="ticket",
        npm_package="@aashari/mcp-server-atlassian-jira",
        required_secrets=[
            CatalogSecret(
                key="JIRA_URL",
                label="Jira Instance URL",
                placeholder="https://your-org.atlassian.net",
            ),
            CatalogSecret(key="JIRA_EMAIL", label="Jira Email"),
            CatalogSecret(key="JIRA_API_TOKEN", label="Jira API Token"),
        ],
        documentation_url="https://github.com/aashari/mcp-server-atlassian-jira",
    ),
    MCPCatalogEntry(
        id="github",
        name="GitHub",
        description="Manage repositories, issues, and pull requests",
        category="development",
        icon="github",
        npm_package="@modelcontextprotocol/server-github",
        required_secrets=[
            CatalogSecret(
                key="GITHUB_TOKEN", label="GitHub Personal Access Token", placeholder="ghp_..."
            ),
        ],
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    # --- New npm-based entries ---
    MCPCatalogEntry(
        id="firecrawl",
        name="Firecrawl",
        description="Web scraping and crawling — converts pages to clean markdown (self-hostable)",
        category="search",
        icon="flame",
        npm_package="firecrawl-mcp",
        required_secrets=[
            CatalogSecret(key="FIRECRAWL_API_KEY", label="Firecrawl API Key", placeholder="fc-..."),
            CatalogSecret(
                key="FIRECRAWL_API_URL",
                label="Firecrawl API URL (for self-hosted)",
                placeholder="https://api.firecrawl.dev",
                required=False,
                is_secret=False,
            ),
        ],
        documentation_url="https://github.com/mendableai/firecrawl-mcp-server",
    ),
    MCPCatalogEntry(
        id="filesystem",
        name="Filesystem",
        description="Local file access — read, write, search, and manage files (sandboxed to /data/files and /data/projects)",
        category="utility",
        icon="folder",
        npm_package="@modelcontextprotocol/server-filesystem",
        default_args=["/data/files", "/data/projects"],
        volumes={
            "/data/files": {"bind": "/data/files", "mode": "rw"},
            "mm-projects": {"bind": "/data/projects", "mode": "rw"},
        },
        documentation_url="https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    ),
    MCPCatalogEntry(
        id="telegram",
        name="Telegram",
        description="Send messages, photos, documents via Telegram Bot API (100% free)",
        category="communication",
        icon="send",
        npm_package="@xingyuchen/telegram-mcp",
        required_secrets=[
            CatalogSecret(
                key="TELEGRAM_BOT_TOKEN", label="Telegram Bot Token", placeholder="123456:ABC-..."
            ),
        ],
        documentation_url="https://github.com/guangxiangdebizi/telegram-mcp",
    ),
    MCPCatalogEntry(
        id="microsoft-365",
        name="Microsoft 365",
        description="Outlook mail, Calendar, OneDrive, Excel via Microsoft Graph (free Azure AD setup)",
        category="productivity",
        icon="mail",
        npm_package="@softeria/ms-365-mcp-server",
        required_secrets=[
            CatalogSecret(key="MS365_MCP_CLIENT_ID", label="Azure AD Application (Client) ID"),
            CatalogSecret(
                key="MS365_MCP_TENANT_ID",
                label="Azure AD Tenant ID",
                placeholder="common",
                required=False,
                is_secret=False,
            ),
        ],
        documentation_url="https://github.com/Softeria/ms-365-mcp-server",
    ),
    # --- Python-based entries (docker_image + server_command) ---
    MCPCatalogEntry(
        id="qdrant",
        name="Qdrant",
        description="Vector database for semantic search and memory — connects to existing Qdrant instance (requires manual image build)",
        category="database",
        icon="database",
        docker_image="modularmind/mcp-qdrant:latest",
        server_command=["/app/.venv/bin/mcp-server-qdrant"],
        mem_limit="512m",
        default_env={"QDRANT_URL": "http://qdrant:6333", "COLLECTION_NAME": "mcp_knowledge"},
        required_secrets=[
            CatalogSecret(
                key="QDRANT_URL",
                label="Qdrant URL",
                placeholder="http://qdrant:6333",
                is_secret=False,
            ),
            CatalogSecret(
                key="COLLECTION_NAME",
                label="Collection Name (use mcp_ prefix to avoid conflicts)",
                placeholder="mcp_knowledge",
                required=False,
                is_secret=False,
            ),
        ],
        documentation_url="https://github.com/qdrant/mcp-server-qdrant",
    ),
    # --- Phase 2: New npm-based entries (verified on npmjs.com 2026-02-16) ---
    MCPCatalogEntry(
        id="gitlab",
        name="GitLab",
        description="Manage GitLab repositories, issues, merge requests, and CI/CD pipelines",
        category="development",
        icon="git-branch",
        npm_package="@modelcontextprotocol/server-gitlab",
        required_secrets=[
            CatalogSecret(key="GITLAB_TOKEN", label="GitLab Personal Access Token"),
            CatalogSecret(
                key="GITLAB_URL",
                label="GitLab Instance URL (default: gitlab.com)",
                placeholder="https://gitlab.com",
                required=False,
                is_secret=False,
            ),
        ],
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    MCPCatalogEntry(
        id="sentry",
        name="Sentry",
        description="Monitor errors, query issues, and manage releases via Sentry",
        category="devops",
        icon="alert-triangle",
        npm_package="@sentry/mcp-server",
        required_secrets=[
            CatalogSecret(key="SENTRY_AUTH_TOKEN", label="Sentry Auth Token"),
            CatalogSecret(key="SENTRY_ORG", label="Sentry Organization Slug", is_secret=False),
        ],
        documentation_url="https://docs.sentry.io/product/sentry-mcp/",
    ),
    MCPCatalogEntry(
        id="cloudflare",
        name="Cloudflare",
        description="Manage Workers, KV, D1, R2, and DNS via Cloudflare API",
        category="devops",
        icon="cloud",
        npm_package="@cloudflare/mcp-server-cloudflare",
        required_secrets=[
            CatalogSecret(key="CLOUDFLARE_API_TOKEN", label="Cloudflare API Token"),
            CatalogSecret(
                key="CLOUDFLARE_ACCOUNT_ID", label="Cloudflare Account ID", is_secret=False
            ),
        ],
        documentation_url="https://github.com/cloudflare/mcp-server-cloudflare",
    ),
    MCPCatalogEntry(
        id="mongodb",
        name="MongoDB",
        description="Query and manage MongoDB databases and collections",
        category="database",
        icon="database",
        npm_package="mongodb-mcp-server",
        required_secrets=[
            CatalogSecret(
                key="MONGODB_URI",
                label="MongoDB Connection URI",
                placeholder="mongodb://user:pass@host:27017/db",
            ),
        ],
        documentation_url="https://github.com/mongodb-js/mongodb-mcp-server",
    ),
    MCPCatalogEntry(
        id="elasticsearch",
        name="Elasticsearch",
        description="Search, index, and manage Elasticsearch clusters",
        category="data-analytics",
        icon="search",
        npm_package="@elastic/mcp-server-elasticsearch",
        required_secrets=[
            CatalogSecret(
                key="ELASTICSEARCH_URL",
                label="Elasticsearch URL",
                placeholder="https://localhost:9200",
            ),
            CatalogSecret(key="ELASTICSEARCH_API_KEY", label="Elasticsearch API Key"),
        ],
        documentation_url="https://github.com/elastic/mcp-server-elasticsearch",
    ),
    MCPCatalogEntry(
        id="stripe",
        name="Stripe",
        description="Manage payments, customers, subscriptions, and invoices via Stripe",
        category="finance",
        icon="credit-card",
        npm_package="@stripe/mcp",
        required_secrets=[
            CatalogSecret(key="STRIPE_SECRET_KEY", label="Stripe Secret Key", placeholder="sk_..."),
        ],
        documentation_url="https://docs.stripe.com/mcp",
    ),
    MCPCatalogEntry(
        id="hubspot",
        name="HubSpot",
        description="Manage CRM contacts, deals, and marketing via HubSpot",
        category="finance",
        icon="briefcase",
        npm_package="@hubspot/mcp-server",
        required_secrets=[
            CatalogSecret(key="HUBSPOT_ACCESS_TOKEN", label="HubSpot Access Token"),
        ],
        documentation_url="https://developers.hubspot.com/mcp",
    ),
    MCPCatalogEntry(
        id="shopify",
        name="Shopify",
        description="Manage products, orders, and store configuration via Shopify",
        category="finance",
        icon="shopping-cart",
        npm_package="@shopify/dev-mcp",
        required_secrets=[
            CatalogSecret(key="SHOPIFY_ACCESS_TOKEN", label="Shopify Access Token"),
            CatalogSecret(
                key="SHOPIFY_STORE_URL",
                label="Shopify Store URL",
                placeholder="https://your-store.myshopify.com",
                is_secret=False,
            ),
        ],
        documentation_url="https://shopify.dev/docs/apps/build/devmcp",
    ),
    MCPCatalogEntry(
        id="discord",
        name="Discord",
        description="Send messages, manage channels, and interact with Discord servers",
        category="communication",
        icon="message-circle",
        npm_package="discord-mcp",
        required_secrets=[
            CatalogSecret(key="DISCORD_BOT_TOKEN", label="Discord Bot Token"),
        ],
        documentation_url="https://github.com/GustyCube/discord-mcp",
    ),
    MCPCatalogEntry(
        id="confluence",
        name="Confluence",
        description="Search and manage Confluence pages, spaces, and content",
        category="productivity",
        icon="file-text",
        npm_package="@aashari/mcp-server-atlassian-confluence",
        required_secrets=[
            CatalogSecret(
                key="CONFLUENCE_URL",
                label="Confluence Base URL",
                placeholder="https://your-org.atlassian.net/wiki",
                is_secret=False,
            ),
            CatalogSecret(key="CONFLUENCE_EMAIL", label="Confluence Email", is_secret=False),
            CatalogSecret(key="CONFLUENCE_API_TOKEN", label="Confluence API Token"),
        ],
        documentation_url="https://github.com/aashari/mcp-server-atlassian-confluence",
    ),
    MCPCatalogEntry(
        id="airtable",
        name="Airtable",
        description="Query and manage Airtable bases, tables, and records",
        category="productivity",
        icon="layout-grid",
        npm_package="airtable-mcp-server",
        required_secrets=[
            CatalogSecret(key="AIRTABLE_API_KEY", label="Airtable API Key"),
        ],
        documentation_url="https://github.com/domdomegg/airtable-mcp-server",
    ),
    MCPCatalogEntry(
        id="code-interpreter",
        name="Code Interpreter",
        description="Execute Python code in a sandboxed E2B environment",
        category="utility",
        icon="terminal",
        npm_package="@e2b/mcp-server",
        required_secrets=[
            CatalogSecret(key="E2B_API_KEY", label="E2B API Key"),
        ],
        documentation_url="https://github.com/e2b-dev/mcp-server",
    ),
    MCPCatalogEntry(
        id="puppeteer",
        name="Puppeteer",
        description="Web browser automation — navigate pages, take screenshots, extract content",
        category="utility",
        icon="globe",
        docker_image="modularmind/mcp-puppeteer:latest",
        server_command=["npx", "-y", "@modelcontextprotocol/server-puppeteer"],
        mem_limit="512m",
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    # --- Phase 3: Free MCPs for agent capabilities (verified on npmjs.com 2026-02-17) ---
    MCPCatalogEntry(
        id="fetch",
        name="Fetch",
        description="Fetch any URL and extract content as clean markdown — no API key required",
        category="utility",
        icon="globe",
        npm_package="@kazuph/mcp-fetch",
        documentation_url="https://github.com/kazuph/mcp-fetch",
    ),
    MCPCatalogEntry(
        id="sequential-thinking",
        name="Sequential Thinking",
        description="Structured step-by-step reasoning with revision and branching — no API key required",
        category="ai",
        icon="brain",
        npm_package="@modelcontextprotocol/server-sequential-thinking",
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    MCPCatalogEntry(
        id="memory",
        name="Memory (Knowledge Graph)",
        description="Persistent knowledge graph — store entities, relations, and observations across sessions — no API key required",
        category="ai",
        icon="database",
        npm_package="@modelcontextprotocol/server-memory",
        documentation_url="https://github.com/modelcontextprotocol/servers",
    ),
    MCPCatalogEntry(
        id="git",
        name="Git",
        description="Read, search, diff, and manage Git repositories — clone, commit, branch, merge, and more",
        category="development",
        icon="git-branch",
        npm_package="@mseep/git-mcp-server",
        volumes={"mm-projects": {"bind": "/data/projects", "mode": "rw"}},
        documentation_url="https://github.com/mseep/git-mcp-server",
    ),
    MCPCatalogEntry(
        id="whatsapp",
        name="WhatsApp",
        description="Send and read WhatsApp messages, search contacts and chats (requires QR code pairing on first use)",
        category="communication",
        icon="message-circle",
        docker_image="modularmind/mcp-whatsapp:latest",
        server_command=[
            "npx",
            "tsx",
            "node_modules/@mseep/whatsapp-mcp-ts/src/main.ts",
        ],
        documentation_url="https://github.com/jlucaso1/whatsapp-mcp-ts",
        setup_flow="qr-code",
    ),
    MCPCatalogEntry(
        id="shell-commands",
        name="Shell Commands",
        description="Execute shell commands and processes — run scripts, install packages, build projects — no API key required",
        category="development",
        icon="terminal",
        npm_package="mcp-server-commands",
        volumes={"mm-projects": {"bind": "/data/projects", "mode": "rw"}},
        documentation_url="https://github.com/g0t4/mcp-server-commands",
    ),
]

# Lookup by ID
_CATALOG_MAP: dict[str, MCPCatalogEntry] = {e.id: e for e in MCP_CATALOG}


def get_catalog() -> list[MCPCatalogEntry]:
    """Return the full MCP server catalog."""
    return MCP_CATALOG


def get_catalog_entry(catalog_id: str) -> MCPCatalogEntry | None:
    """Lookup a catalog entry by ID."""
    return _CATALOG_MAP.get(catalog_id)


def get_free_catalog_entries() -> list[MCPCatalogEntry]:
    """Return catalog entries that require no credentials.

    An entry is "free" when it has no required_secrets at all, or all of its
    secrets have ``required=False`` (i.e. they have sensible defaults).
    """
    return [entry for entry in MCP_CATALOG if all(not s.required for s in entry.required_secrets)]
