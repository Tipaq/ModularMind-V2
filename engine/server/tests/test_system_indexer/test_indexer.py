"""Tests for the system indexer pipeline."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.system_indexer.chunker import split_units
from src.system_indexer.models import StructuralUnit


class TestIndexerBatching:
    @pytest.mark.asyncio
    async def test_index_calls_embed_in_batches(self):
        from src.system_indexer.indexer import _upsert_chunks_to_qdrant

        units = [
            StructuralUnit(
                id=f"u{i}",
                system_id="s1",
                kind="table",
                name=f"table_{i}",
                qualified_name=f"db.table_{i}",
                summary=f"Table {i}",
                signature=f"TABLE table_{i}",
            )
            for i in range(5)
        ]
        chunks = split_units(units)

        embed_calls = []

        async def mock_embed(texts):
            embed_calls.append(len(texts))
            return [[0.1] * 768 for _ in texts]

        mock_client = AsyncMock()
        with patch("src.system_indexer.indexer.qdrant_factory") as mock_factory:
            mock_factory.get_client = AsyncMock(return_value=mock_client)
            with patch("src.system_indexer.indexer.EMBED_BATCH_SIZE", 3):
                await _upsert_chunks_to_qdrant(chunks, mock_embed, None, 5)

        assert embed_calls == [3, 2]
        assert mock_client.upsert.call_count >= 1


class TestDeleteSystemData:
    @pytest.mark.asyncio
    async def test_delete_calls_qdrant_and_pg(self):
        from src.system_indexer.indexer import delete_system_data

        mock_client = AsyncMock()
        mock_session = AsyncMock()

        with patch("src.system_indexer.indexer.qdrant_factory") as mock_factory:
            mock_factory.get_client = AsyncMock(return_value=mock_client)
            await delete_system_data("sys-1", mock_session)

        mock_client.delete.assert_called_once()
        mock_session.execute.assert_called_once()


class TestFetchExistingHashes:
    @pytest.mark.asyncio
    async def test_returns_hash_map(self):
        from src.system_indexer.indexer import fetch_existing_hashes

        mock_point = MagicMock()
        mock_point.payload = {
            "metadata": {"unit_id": "u1", "body_hash": "hash1"}
        }

        mock_client = AsyncMock()
        mock_client.scroll = AsyncMock(return_value=([mock_point], None))

        with patch("src.system_indexer.indexer.qdrant_factory") as mock_factory:
            mock_factory.get_client = AsyncMock(return_value=mock_client)
            result = await fetch_existing_hashes("sys-1")

        assert result == {"u1": "hash1"}

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_points(self):
        from src.system_indexer.indexer import fetch_existing_hashes

        mock_client = AsyncMock()
        mock_client.scroll = AsyncMock(return_value=([], None))

        with patch("src.system_indexer.indexer.qdrant_factory") as mock_factory:
            mock_factory.get_client = AsyncMock(return_value=mock_client)
            result = await fetch_existing_hashes("sys-1")

        assert result == {}
