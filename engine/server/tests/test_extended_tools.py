"""Tests for the extended tool system.

Tests tool definitions, registry resolution, executor dispatch,
and individual category handlers (with mocked dependencies).
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import _Session


# ---------------------------------------------------------------------------
# Registry + Definitions
# ---------------------------------------------------------------------------


class TestToolRegistry:
    """Test tool category registry and definition resolution."""

    def test_resolve_returns_empty_for_all_disabled(self):
        from src.tools.registry import resolve_tool_definitions

        categories = {
            "memory": False,
            "knowledge": False,
            "code_search": False,
            "file_storage": False,
            "human_interaction": False,
            "image_generation": False,
            "custom_tools": False,
        }
        tools = resolve_tool_definitions(categories)
        assert tools == []

    def test_resolve_returns_tools_for_enabled_categories(self):
        from src.tools.registry import resolve_tool_definitions

        categories = {"memory": True, "knowledge": False, "custom_tools": False}
        tools = resolve_tool_definitions(categories)
        assert len(tools) == 2  # memory_recall + memory_list
        names = {t["function"]["name"] for t in tools}
        assert names == {"memory_recall", "memory_list"}

    def test_resolve_all_categories(self):
        from src.tools.registry import resolve_tool_definitions

        categories = {
            "memory": True,
            "knowledge": True,
            "code_search": True,
            "file_storage": True,
            "human_interaction": True,
            "image_generation": True,
            "custom_tools": True,
        }
        tools = resolve_tool_definitions(categories)
        assert len(tools) == 20  # 2+2+2+6+2+2+4

    def test_all_definitions_have_valid_format(self):
        from src.tools.registry import resolve_tool_definitions

        categories = {k: True for k in [
            "memory", "knowledge", "code_search", "file_storage",
            "human_interaction", "image_generation", "custom_tools",
        ]}
        tools = resolve_tool_definitions(categories)

        for tool in tools:
            assert tool["type"] == "function", f"Tool missing type=function: {tool}"
            fn = tool["function"]
            assert "name" in fn, f"Tool missing name: {tool}"
            assert "description" in fn, f"Tool {fn['name']} missing description"
            assert "parameters" in fn, f"Tool {fn['name']} missing parameters"
            params = fn["parameters"]
            assert params["type"] == "object", f"Tool {fn['name']} params not object"
            assert "properties" in params, f"Tool {fn['name']} missing properties"

    def test_no_duplicate_tool_names(self):
        from src.tools.registry import resolve_tool_definitions

        categories = {k: True for k in [
            "memory", "knowledge", "code_search", "file_storage",
            "human_interaction", "image_generation", "custom_tools",
        ]}
        tools = resolve_tool_definitions(categories)
        names = [t["function"]["name"] for t in tools]
        assert len(names) == len(set(names)), f"Duplicate names: {names}"

    def test_unknown_category_ignored(self):
        from src.tools.registry import resolve_tool_definitions

        categories = {"nonexistent_category": True}
        tools = resolve_tool_definitions(categories)
        assert tools == []


# ---------------------------------------------------------------------------
# Extended Tool Executor
# ---------------------------------------------------------------------------


class TestExtendedToolExecutor:
    """Test executor dispatch and handles() method."""

    def test_handles_known_prefixes(self):
        from src.tools.executor import ExtendedToolExecutor

        executor = ExtendedToolExecutor(
            session_maker=MagicMock(),
            user_id="u1",
            agent_id="a1",
        )
        assert executor.handles("memory_recall")
        assert executor.handles("memory_list")
        assert executor.handles("knowledge_search")
        assert executor.handles("storage_upload")
        assert executor.handles("human_prompt")
        assert executor.handles("image_generate")
        assert executor.handles("custom_tool_register")

    def test_does_not_handle_unknown_prefixes(self):
        from src.tools.executor import ExtendedToolExecutor

        executor = ExtendedToolExecutor(
            session_maker=MagicMock(),
            user_id="u1",
            agent_id="a1",
        )
        assert not executor.handles("gateway__fs_read")
        assert not executor.handles("automation__list")
        assert not executor.handles("conversation_search")
        assert not executor.handles("random_tool")


# ---------------------------------------------------------------------------
# UnifiedToolExecutor Integration
# ---------------------------------------------------------------------------


class TestUnifiedToolExecutorExtended:
    """Test that UnifiedToolExecutor dispatches to extended executor."""

    @pytest.mark.asyncio
    async def test_dispatches_to_extended(self):
        from src.graph_engine.builtin_tools import UnifiedToolExecutor

        extended = AsyncMock()
        extended.handles.return_value = True
        extended.execute.return_value = "extended result"

        executor = UnifiedToolExecutor(
            builtin_fn=AsyncMock(),
            mcp_executor=None,
            builtin_names=set(),
            extended_executor=extended,
        )

        result = await executor.execute("memory_recall", {"query": "test"})
        assert result == "extended result"
        extended.execute.assert_called_once_with("memory_recall", {"query": "test"})

    @pytest.mark.asyncio
    async def test_extended_skipped_when_not_handled(self):
        from src.graph_engine.builtin_tools import UnifiedToolExecutor

        extended = AsyncMock()
        extended.handles.return_value = False

        mcp = AsyncMock()
        mcp.execute.return_value = "mcp result"

        executor = UnifiedToolExecutor(
            builtin_fn=AsyncMock(),
            mcp_executor=mcp,
            builtin_names=set(),
            extended_executor=extended,
        )

        result = await executor.execute("some_mcp_tool", {"x": 1})
        assert result == "mcp result"
        extended.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_builtin_takes_priority_over_extended(self):
        from src.graph_engine.builtin_tools import UnifiedToolExecutor

        builtin = AsyncMock(return_value="builtin result")
        extended = AsyncMock()

        executor = UnifiedToolExecutor(
            builtin_fn=builtin,
            mcp_executor=None,
            builtin_names={"conversation_search"},
            extended_executor=extended,
        )

        result = await executor.execute("conversation_search", {"query": "test"})
        assert result == "builtin result"
        extended.handles.assert_not_called()


# ---------------------------------------------------------------------------
# Memory Tools
# ---------------------------------------------------------------------------


class TestMemoryToolDefinitions:
    """Test memory tool definitions."""

    def test_definitions_count(self):
        from src.tools.categories.memory import get_memory_tool_definitions

        defs = get_memory_tool_definitions()
        assert len(defs) == 2

    def test_recall_requires_query(self):
        from src.tools.categories.memory import get_memory_tool_definitions

        defs = get_memory_tool_definitions()
        recall = next(d for d in defs if d["function"]["name"] == "memory_recall")
        assert "query" in recall["function"]["parameters"]["required"]


# ---------------------------------------------------------------------------
# Knowledge Tools
# ---------------------------------------------------------------------------


class TestKnowledgeToolDefinitions:
    def test_definitions_count(self):
        from src.tools.categories.knowledge import get_knowledge_tool_definitions

        defs = get_knowledge_tool_definitions()
        assert len(defs) == 2

    @pytest.mark.asyncio
    async def test_search_without_retriever_returns_error(self):
        from src.tools.categories.knowledge import execute_knowledge_tool

        session = AsyncMock(spec=AsyncSession)
        result = await execute_knowledge_tool(
            "knowledge_search",
            {"query": "test"},
            user_id="u1",
            session=session,
            rag_retriever=None,
        )
        assert "not configured" in result


# ---------------------------------------------------------------------------
# File Storage Tools
# ---------------------------------------------------------------------------


class TestFileStorageToolDefinitions:
    def test_definitions_count(self):
        from src.tools.categories.file_storage import get_file_storage_tool_definitions

        defs = get_file_storage_tool_definitions()
        assert len(defs) == 6

    @pytest.mark.asyncio
    async def test_without_object_store_returns_error(self):
        from src.tools.categories.file_storage import execute_storage_tool

        session = AsyncMock(spec=AsyncSession)
        result = await execute_storage_tool(
            "storage_upload",
            {"name": "test.txt", "content": "hello"},
            user_id="u1",
            agent_id="a1",
            session=session,
            object_store=None,
        )
        assert "not configured" in result


# ---------------------------------------------------------------------------
# Human Interaction Tools
# ---------------------------------------------------------------------------


class TestHumanInteractionTools:
    def test_definitions_count(self):
        from src.tools.categories.human_interaction import (
            get_human_interaction_tool_definitions,
        )

        defs = get_human_interaction_tool_definitions()
        assert len(defs) == 2

    @pytest.mark.asyncio
    async def test_notify_with_publish(self):
        from src.tools.categories.human_interaction import (
            execute_human_interaction_tool,
        )

        publish = AsyncMock()
        result = await execute_human_interaction_tool(
            "human_notify",
            {"title": "Test", "body": "Hello"},
            publish_fn=publish,
        )
        assert "Notification sent" in result
        publish.assert_called_once()
        event = publish.call_args[0][0]
        assert event["type"] == "notification"
        assert event["title"] == "Test"

    @pytest.mark.asyncio
    async def test_prompt_sends_sse_event(self):
        from src.tools.categories.human_interaction import (
            execute_human_interaction_tool,
        )

        publish = AsyncMock()
        result = await execute_human_interaction_tool(
            "human_prompt",
            {
                "prompt_type": "confirm",
                "question": "Continue?",
            },
            publish_fn=publish,
        )
        assert "Prompt sent" in result
        event = publish.call_args[0][0]
        assert event["type"] == "human_prompt"
        assert event["prompt_type"] == "confirm"
        assert len(event["options"]) == 2  # Yes/No defaults


# ---------------------------------------------------------------------------
# Image Generation Tools
# ---------------------------------------------------------------------------


class TestImageGenerationTools:
    def test_definitions_count(self):
        from src.tools.categories.image_generation import (
            get_image_generation_tool_definitions,
        )

        defs = get_image_generation_tool_definitions()
        assert len(defs) == 2

    def test_list_models_returns_json(self):
        from src.tools.categories.image_generation import (
            execute_image_generation_tool,
        )

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            execute_image_generation_tool("image_list_models", {})
        )
        models = json.loads(result)
        assert len(models) >= 1
        assert models[0]["id"] == "openai:dall-e-3"


# ---------------------------------------------------------------------------
# Custom Tools
# ---------------------------------------------------------------------------


class TestCustomToolDefinitions:
    def test_definitions_count(self):
        from src.tools.categories.custom_tools import get_custom_tool_definitions

        defs = get_custom_tool_definitions()
        assert len(defs) == 4

    def test_register_requires_name_and_executor(self):
        from src.tools.categories.custom_tools import get_custom_tool_definitions

        defs = get_custom_tool_definitions()
        register = next(d for d in defs if d["function"]["name"] == "custom_tool_register")
        required = register["function"]["parameters"]["required"]
        assert "name" in required
        assert "executor_type" in required
        assert "executor_config" in required


# ---------------------------------------------------------------------------
# Code Search Tools
# ---------------------------------------------------------------------------


class TestCodeSearchToolDefinitions:
    def test_definitions_count(self):
        from src.tools.categories.code_search import (
            get_code_search_tool_definitions,
        )

        defs = get_code_search_tool_definitions()
        assert len(defs) == 2

    def test_grep_requires_pattern(self):
        from src.tools.categories.code_search import (
            get_code_search_tool_definitions,
        )

        defs = get_code_search_tool_definitions()
        grep = next(d for d in defs if d["function"]["name"] == "gateway__code_grep")
        assert "pattern" in grep["function"]["parameters"]["required"]


# ---------------------------------------------------------------------------
# AgentConfig integration
# ---------------------------------------------------------------------------


class TestAgentConfigToolCategories:
    def test_default_tool_categories(self):
        from src.graph_engine.interfaces import AgentConfig

        agent = AgentConfig(id="test", name="Test Agent")
        assert agent.tool_categories["memory"] is True
        assert agent.tool_categories["knowledge"] is True
        assert agent.tool_categories["code_search"] is False
        assert agent.tool_categories["custom_tools"] is False

    def test_custom_tool_categories(self):
        from src.graph_engine.interfaces import AgentConfig

        agent = AgentConfig(
            id="test",
            name="Test Agent",
            tool_categories={
                "memory": False,
                "knowledge": False,
                "custom_tools": True,
            },
        )
        assert agent.tool_categories["memory"] is False
        assert agent.tool_categories["custom_tools"] is True


# ---------------------------------------------------------------------------
# Gateway Schemas
# ---------------------------------------------------------------------------


class TestGatewayToolDefinitions:
    def test_code_search_enabled(self):
        from src.gateway.tool_definitions import get_gateway_tool_definitions

        tools = get_gateway_tool_definitions({"code_search": {"enabled": True}})
        names = {t["function"]["name"] for t in tools}
        assert "gateway__code_grep" in names
        assert "gateway__code_multi_edit" in names

    def test_code_search_disabled_by_default(self):
        from src.gateway.tool_definitions import get_gateway_tool_definitions

        tools = get_gateway_tool_definitions({})
        names = {t["function"]["name"] for t in tools}
        assert "gateway__code_grep" not in names


# ---------------------------------------------------------------------------
# Models (SQLAlchemy)
# ---------------------------------------------------------------------------


class TestToolModels:
    def test_custom_tool_model_instantiation(self):
        from src.tools.models import CustomTool

        tool = CustomTool(
            agent_id="agent-1",
            name="my_tool",
            description="A test tool",
            executor_type="shell",
            executor_config={"command": "echo hello"},
        )
        assert tool.name == "my_tool"
        assert tool.executor_type == "shell"

    def test_stored_file_model_instantiation(self):
        from src.tools.models import StoredFile

        stored = StoredFile(
            agent_id="agent-1",
            user_id="user-1",
            name="report.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            s3_bucket="agent-files",
            s3_key="agents/agent-1/file-1/report.pdf",
        )
        assert stored.name == "report.pdf"
        assert stored.size_bytes == 1024
