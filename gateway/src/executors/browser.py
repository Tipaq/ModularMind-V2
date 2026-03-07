"""Browser executor — Phase 6 stub (Playwright container sidecar)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)


class BrowserExecutor(BaseExecutor):
    """Execute browser operations inside a sandbox container.

    Phase 6: Will use Playwright via CDP connection to a browser sidecar.
    """

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        return "Browser executor is not yet implemented (Phase 6)"
