"""Network executor — Phase 7 stub (HTTP request proxy)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)


class NetworkExecutor(BaseExecutor):
    """Execute network requests with domain allow/deny enforcement.

    Phase 7: Will proxy HTTP requests through the Gateway with domain validation.
    """

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        return "Network executor is not yet implemented (Phase 7)"
