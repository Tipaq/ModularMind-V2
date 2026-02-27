"""
Supervisor module — Super Supervisor for unified chat with intelligent routing.

Provides the SuperSupervisorService that receives all user messages and decides
the routing strategy: direct response, agent delegation, graph execution,
ephemeral agent creation, or multi-action.
"""

from .context_manager import (
    HierarchicalContextManager,
    get_context_manager,
    init_context_manager,
)
from .ephemeral_factory import EphemeralAgentFactory
from .message_parser import MessageParser
from .schemas import (
    ParsedMessage,
    RoutingDecision,
    RoutingStrategy,
    SubContext,
    SupervisorConfig,
)
from .service import SuperSupervisorService

__all__ = [
    "SuperSupervisorService",
    "MessageParser",
    "EphemeralAgentFactory",
    "HierarchicalContextManager",
    "get_context_manager",
    "init_context_manager",
    "RoutingStrategy",
    "RoutingDecision",
    "ParsedMessage",
    "SubContext",
    "SupervisorConfig",
]
