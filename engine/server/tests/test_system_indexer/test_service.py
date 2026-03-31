"""Tests for the system_indexer service layer."""

from unittest.mock import AsyncMock, MagicMock

import pytest


class TestCreateSystem:
    @pytest.mark.asyncio
    async def test_create_system_returns_pending(self):
        from src.system_indexer.service import create_system

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock()

        system = await create_system(
            mock_session, name="Test DB", system_type="database", base_url="pg://localhost"
        )
        assert system.name == "Test DB"
        assert system.system_type == "database"
        assert system.status == "pending"
        assert system.unit_count == 0
        assert system.base_url == "pg://localhost"
        mock_session.add.assert_called_once()


class TestListSystems:
    @pytest.mark.asyncio
    async def test_list_returns_all(self):
        from src.system_indexer.service import list_systems

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = ["sys1", "sys2"]
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await list_systems(mock_session)
        assert result == ["sys1", "sys2"]


class TestGetSystem:
    @pytest.mark.asyncio
    async def test_get_returns_system(self):
        from src.system_indexer.service import get_system

        mock_system = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_system
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await get_system(mock_session, "sys-1")
        assert result is mock_system

    @pytest.mark.asyncio
    async def test_get_returns_none_for_missing(self):
        from src.system_indexer.service import get_system

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await get_system(mock_session, "missing")
        assert result is None
