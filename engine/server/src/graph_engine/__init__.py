"""Execution module - Graph compilation and execution."""

from .agent_invoker import AgentInvoker
from .callbacks import ExecutionTraceHandler, TokenAccumulator
from .compiler import GraphCompiler
from .condition_eval import build_condition_context, safe_eval_condition
from .interfaces import (
    AgentConfig,
    AutomationConfig,
    ConfigProviderProtocol,
    ConfigVersion,
    EdgeConfig,
    GraphConfig,
    LLMProviderProtocol,
    NodeConfig,
    RAGConfig,
)
from .state import GraphState, create_initial_state
from .tool_loop import run_tool_loop, try_bind_tools

__all__ = [
    # Agent invoker
    "AgentInvoker",
    # Compiler
    "GraphCompiler",
    # Condition evaluator
    "safe_eval_condition",
    "build_condition_context",
    # Protocols (DI contracts)
    "ConfigProviderProtocol",
    "LLMProviderProtocol",
    # Data models
    "AgentConfig",
    "AutomationConfig",
    "GraphConfig",
    "NodeConfig",
    "EdgeConfig",
    "RAGConfig",
    "ConfigVersion",
    # Callbacks
    "ExecutionTraceHandler",
    "TokenAccumulator",
    # State
    "GraphState",
    "create_initial_state",
    # Tool calling loop
    "run_tool_loop",
    "try_bind_tools",
]
