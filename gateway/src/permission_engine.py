"""Gateway PermissionEngine — loads permissions from DB, evaluates rules.

The Gateway is the authority on permissions. It loads them independently
from the shared PostgreSQL database using the agent_id. The engine never
sends permissions — only agent_id.
"""

import fnmatch
import logging
import posixpath
import time
from enum import Enum

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.approval.models import GatewayApprovalRule
from src.models.agent_config import AgentConfigMirror
from src.schemas import GatewayPermissions

logger = logging.getLogger(__name__)


class EvalResult(str, Enum):
    """Permission evaluation result."""
    AUTO_APPROVE = "auto_approve"
    AUTO_DENY = "auto_deny"
    REQUIRES_APPROVAL = "requires_approval"


def normalize_and_check_path(raw_path: str) -> tuple[str, str | None]:
    """Normalize path and validate it's under /workspace/.

    Returns (normalized_path, error_message_or_none).
    """
    normalized = posixpath.normpath(raw_path)

    # Block path traversal
    if ".." in normalized.split("/"):
        return normalized, f"Path '{raw_path}' contains path traversal"
    if not normalized.startswith("/workspace"):
        return normalized, f"Path '{raw_path}' is outside allowed scope (/workspace)"

    return normalized, None


class PermissionEngine:
    """Evaluates permissions for gateway tool calls.

    Loads permissions from the shared PostgreSQL database (agent_configs table).
    Caches permissions per agent_id with configurable TTL.
    """

    def __init__(self, db: AsyncSession, cache_ttl: float = 60.0):
        self._db = db
        self._cache: dict[str, tuple[GatewayPermissions, float]] = {}
        self._cache_ttl = cache_ttl

    async def get_permissions(self, agent_id: str) -> GatewayPermissions | None:
        """Load permissions from shared PostgreSQL.

        Returns None if agent has no gateway_permissions configured.
        """
        # Check cache
        if agent_id in self._cache:
            perms, ts = self._cache[agent_id]
            if time.time() - ts < self._cache_ttl:
                return perms

        # Load from DB — filter is_active=true to get current version only
        result = await self._db.execute(
            select(AgentConfigMirror.config).where(
                AgentConfigMirror.id == agent_id,
                AgentConfigMirror.is_active == True,  # noqa: E712
            )
        )
        row = result.scalar_one_or_none()
        if not row or "gateway_permissions" not in row:
            self._cache.pop(agent_id, None)
            return None

        new_perms = GatewayPermissions.model_validate(row["gateway_permissions"])

        # Check if permissions changed — invalidate stale rules if so
        old_entry = self._cache.get(agent_id)
        if old_entry:
            old_perms = old_entry[0]
            if old_perms != new_perms:
                await self._invalidate_stale_rules(agent_id, old_perms, new_perms)

        self._cache[agent_id] = (new_perms, time.time())
        return new_perms

    def invalidate_cache(self, agent_id: str | None = None) -> None:
        """Invalidate cache for a specific agent or all agents."""
        if agent_id:
            self._cache.pop(agent_id, None)
        else:
            self._cache.clear()

    async def evaluate(
        self,
        agent_id: str,
        category: str,
        action: str,
        tool_name: str,
        args: dict,
    ) -> tuple[EvalResult, str | None]:
        """Evaluate permission for a tool call.

        Returns (EvalResult, error_or_none).

        Evaluation order:
        1. Explicit deny → reject
        2. Pre-approval rules → auto-approve
        3. Explicit allow → auto-approve
        4. require_approval flag → requires approval
        5. Default deny
        """
        perms = await self.get_permissions(agent_id)
        if perms is None:
            return EvalResult.AUTO_DENY, "No gateway permissions configured for this agent"

        if category == "filesystem":
            return await self._evaluate_filesystem(agent_id, action, args, perms)
        elif category == "shell":
            return await self._evaluate_shell(agent_id, action, args, perms)
        elif category == "browser":
            return await self._evaluate_browser(agent_id, action, args, perms)
        elif category == "network":
            return await self._evaluate_network(agent_id, action, args, perms)
        else:
            return EvalResult.AUTO_DENY, f"Unknown permission category: {category}"

    async def _evaluate_filesystem(
        self,
        agent_id: str,
        action: str,
        args: dict,
        perms: GatewayPermissions,
    ) -> tuple[EvalResult, str | None]:
        """Evaluate filesystem permission."""
        raw_path = args.get("path", "")
        normalized, error = normalize_and_check_path(raw_path)
        if error:
            return EvalResult.AUTO_DENY, error

        # Update args with normalized path
        args["path"] = normalized

        # 1. Explicit deny (highest priority)
        for pattern in perms.filesystem.deny:
            if fnmatch.fnmatch(normalized, pattern):
                return EvalResult.AUTO_DENY, f"Path '{normalized}' matches deny pattern '{pattern}'"

        # 2. Check pre-approval rules
        if await self._check_rules(agent_id, "filesystem", action, normalized):
            return EvalResult.AUTO_APPROVE, None

        # 3. Explicit allow
        allow_patterns = (
            perms.filesystem.read if action == "read"
            else perms.filesystem.write if action in ("write", "delete")
            else perms.filesystem.read  # list uses read permissions
        )
        for pattern in allow_patterns:
            if fnmatch.fnmatch(normalized, pattern):
                return EvalResult.AUTO_APPROVE, None

        # 4. Default deny for filesystem (no require_approval flag — too dangerous)
        return EvalResult.AUTO_DENY, f"No matching allow pattern for '{normalized}'"

    async def _evaluate_shell(
        self,
        agent_id: str,
        action: str,
        args: dict,
        perms: GatewayPermissions,
    ) -> tuple[EvalResult, str | None]:
        """Evaluate shell permission."""
        if not perms.shell.enabled:
            return EvalResult.AUTO_DENY, "Shell access is not enabled for this agent"

        command = args.get("command", "")

        # 1. Explicit deny
        for pattern in perms.shell.deny:
            if fnmatch.fnmatch(command, pattern):
                return EvalResult.AUTO_DENY, f"Command matches deny pattern '{pattern}'"

        # 2. Check pre-approval rules
        if await self._check_rules(agent_id, "shell", action, command):
            return EvalResult.AUTO_APPROVE, None

        # 3. Explicit allow
        for pattern in perms.shell.allow:
            if fnmatch.fnmatch(command, pattern):
                if perms.shell.require_approval:
                    return EvalResult.REQUIRES_APPROVAL, None
                return EvalResult.AUTO_APPROVE, None

        # 4. Default deny
        return EvalResult.AUTO_DENY, f"No matching allow pattern for command"

    async def _evaluate_browser(
        self,
        agent_id: str,
        action: str,
        args: dict,
        perms: GatewayPermissions,
    ) -> tuple[EvalResult, str | None]:
        """Evaluate browser permission."""
        if not perms.browser.enabled:
            return EvalResult.AUTO_DENY, "Browser access is not enabled for this agent"

        url = args.get("url", "")

        # 1. Explicit deny
        for pattern in perms.browser.deny_urls:
            if fnmatch.fnmatch(url, pattern):
                return EvalResult.AUTO_DENY, f"URL matches deny pattern '{pattern}'"

        # 2. Check pre-approval rules
        if await self._check_rules(agent_id, "browser", action, url):
            return EvalResult.AUTO_APPROVE, None

        # 3. Explicit allow
        for pattern in perms.browser.allow_urls:
            if fnmatch.fnmatch(url, pattern):
                if perms.browser.require_approval:
                    return EvalResult.REQUIRES_APPROVAL, None
                return EvalResult.AUTO_APPROVE, None

        # 4. Default deny
        return EvalResult.AUTO_DENY, "No matching allow pattern for URL"

    async def _evaluate_network(
        self,
        agent_id: str,
        action: str,
        args: dict,
        perms: GatewayPermissions,
    ) -> tuple[EvalResult, str | None]:
        """Evaluate network permission."""
        if not perms.network.enabled:
            return EvalResult.AUTO_DENY, "Network access is not enabled for this agent"

        # Extract domain from URL for pattern matching
        from urllib.parse import urlparse

        url = args.get("url", "")
        parsed = urlparse(url)
        domain = parsed.hostname or url

        # 1. Explicit deny
        for pattern in perms.network.deny_domains:
            if fnmatch.fnmatch(domain, pattern):
                return EvalResult.AUTO_DENY, f"Domain matches deny pattern '{pattern}'"

        # 2. Check pre-approval rules
        if await self._check_rules(agent_id, "network", action, domain):
            return EvalResult.AUTO_APPROVE, None

        # 3. Explicit allow
        for pattern in perms.network.allow_domains:
            if fnmatch.fnmatch(domain, pattern):
                return EvalResult.AUTO_APPROVE, None

        # 4. Default deny
        return EvalResult.AUTO_DENY, "No matching allow pattern for domain"

    async def _check_rules(
        self,
        agent_id: str,
        category: str,
        action: str,
        target: str,
    ) -> bool:
        """Check if any pre-approval rule matches."""
        result = await self._db.execute(
            select(GatewayApprovalRule).where(
                GatewayApprovalRule.is_active == True,  # noqa: E712
                GatewayApprovalRule.category == category,
                GatewayApprovalRule.action == action,
                (GatewayApprovalRule.agent_id == agent_id)
                | (GatewayApprovalRule.agent_id == None),  # noqa: E711 — global rules
            )
        )
        rules = result.scalars().all()

        for rule in rules:
            if fnmatch.fnmatch(target, rule.pattern):
                # Increment match counter (non-blocking, best-effort)
                await self._db.execute(
                    update(GatewayApprovalRule)
                    .where(GatewayApprovalRule.id == rule.id)
                    .values(match_count=GatewayApprovalRule.match_count + 1)
                )
                return True

        return False

    async def _invalidate_stale_rules(
        self,
        agent_id: str,
        old: GatewayPermissions,
        new: GatewayPermissions,
    ) -> None:
        """Deactivate rules for categories that were disabled or narrowed."""
        changes = []
        if old.filesystem.write and not new.filesystem.write:
            changes.append("filesystem")
        if old.shell.enabled and not new.shell.enabled:
            changes.append("shell")
        if old.browser.enabled and not new.browser.enabled:
            changes.append("browser")
        if old.network.enabled and not new.network.enabled:
            changes.append("network")

        if changes:
            await self._db.execute(
                update(GatewayApprovalRule)
                .where(
                    GatewayApprovalRule.agent_id == agent_id,
                    GatewayApprovalRule.category.in_(changes),
                    GatewayApprovalRule.is_active == True,  # noqa: E712
                )
                .values(is_active=False)
            )
            logger.info(
                "Invalidated rules for agent %s categories: %s", agent_id, changes
            )
