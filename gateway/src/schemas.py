"""Gateway request/response schemas and permission models."""

from __future__ import annotations

from pydantic import BaseModel, Field


# =============================================================================
# Permission Models (stored in agent config JSONB)
# =============================================================================

class FilesystemPermissions(BaseModel):
    read: list[str] = []       # glob patterns for allowed read paths
    write: list[str] = []      # glob patterns for allowed write paths
    deny: list[str] = []       # glob patterns — highest priority, always denied
    max_file_size_bytes: int = 10_485_760  # 10MB


class ShellPermissions(BaseModel):
    enabled: bool = False
    allow: list[str] = []      # command glob patterns
    deny: list[str] = []       # command deny patterns
    require_approval: bool = True
    max_execution_seconds: int = 30


class NetworkPermissions(BaseModel):
    enabled: bool = False
    allow_domains: list[str] = []
    deny_domains: list[str] = []


class BrowserPermissions(BaseModel):
    enabled: bool = False
    allow_urls: list[str] = []
    deny_urls: list[str] = []
    headless_only: bool = True
    require_approval: bool = True
    max_page_load_seconds: int = 30


class GatewayPermissions(BaseModel):
    filesystem: FilesystemPermissions = FilesystemPermissions()
    shell: ShellPermissions = ShellPermissions()
    network: NetworkPermissions = NetworkPermissions()
    browser: BrowserPermissions = BrowserPermissions()


# =============================================================================
# API Request/Response Schemas
# =============================================================================

class ExecuteRequest(BaseModel):
    """Request to execute a gateway tool."""
    request_id: str = Field(..., description="Unique request ID (UUID)")
    agent_id: str = Field(..., description="Agent ID to load permissions for")
    execution_id: str = Field(..., description="Execution ID for sandbox reuse")
    user_id: str = Field(..., description="User who initiated the execution")
    tool: str = Field(..., description="Tool name (e.g., gateway__fs_read)")
    category: str = Field(..., description="Permission category (filesystem, shell, etc.)")
    action: str = Field(..., description="Action within category (read, write, execute)")
    args: dict = Field(default_factory=dict, description="Tool arguments")
    timeout_seconds: int = Field(default=30, ge=5, le=300)


class ExecuteResponse(BaseModel):
    """Response from a gateway tool execution."""
    request_id: str
    status: str  # allowed, denied, pending_approval, error, timeout
    result: str | None = None
    error: str | None = None
    approval_id: str | None = None  # Set when status is pending_approval


class ApprovalDecisionRequest(BaseModel):
    """Request to approve or reject a pending approval."""
    notes: str | None = None
    remember: bool = False
    remember_pattern: str | None = None


class ApprovalResponse(BaseModel):
    """Response from an approval decision."""
    approval_id: str
    status: str  # approved, rejected, already_processed
    message: str | None = None


class RuleCreateRequest(BaseModel):
    """Request to manually create a pre-approval rule."""
    agent_id: str | None = None
    category: str
    action: str
    pattern: str
    description: str | None = None


class RuleResponse(BaseModel):
    """Response for a pre-approval rule."""
    id: str
    agent_id: str | None
    category: str
    action: str
    pattern: str
    description: str | None
    is_active: bool
    match_count: int
    created_by: str
    created_at: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str
    sandboxes_active: int = 0
    approvals_pending: int = 0
