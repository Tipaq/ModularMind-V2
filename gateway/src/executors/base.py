"""Abstract base executor for gateway tool categories."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager


class BaseExecutor(ABC):
    """Base class for gateway tool executors."""

    @abstractmethod
    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        """Execute an action in the given sandbox.

        Args:
            action: The action to perform (read, write, list, delete, execute, etc.)
            args: Tool arguments
            sandbox_mgr: SandboxManager for Docker exec calls
            execution_id: Execution ID for sandbox routing

        Returns:
            String result of the execution
        """
        ...
