"""Redis stream handler for system indexing tasks."""

from __future__ import annotations

import logging

from src.infra.database import async_session_maker

logger = logging.getLogger(__name__)


async def system_index_handler(data: dict) -> None:
    """Process a system indexing request from the tasks:system_index stream.

    Expected data keys:
        system_id: str — IndexedSystem.id
        action: str — "index" | "reindex"
        connector_type: str — "database" | "rest_api" | "builder"
    """
    system_id = data.get("system_id", "")
    action = data.get("action", "index")
    connector_type = data.get("connector_type", "")

    if not system_id:
        logger.error("system_index_handler: missing system_id")
        return

    logger.info(
        "Processing system index: system_id=%s action=%s connector=%s",
        system_id,
        action,
        connector_type,
    )

    async with async_session_maker() as session:
        try:
            await _dispatch(session, system_id, action, connector_type, data)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("system_index_handler failed for system %s", system_id)
            await _mark_failed(session, system_id)
            await session.commit()


async def _dispatch(
    session,
    system_id: str,
    action: str,
    connector_type: str,
    data: dict,
) -> None:
    from src.embedding import get_embedding_provider
    from src.infra.config import get_settings
    from src.system_indexer.db_models import IndexedSystem
    from src.system_indexer.indexer import incremental_reindex, index_system

    settings = get_settings()
    provider = get_embedding_provider(settings.EMBEDDING_PROVIDER)

    if connector_type == "database":
        from src.system_indexer.connectors.database import DatabaseConnector

        connector = DatabaseConnector()
        system = await session.get(IndexedSystem, system_id)
        if not system or not system.base_url:
            logger.error("Cannot index system %s: missing base_url", system_id)
            return

        system_index = await connector.index({"database_url": system.base_url})

        if action == "reindex":
            await incremental_reindex(
                system_id, system_index, session, provider.embed_texts
            )
        else:
            await index_system(
                system_id, system_index, session, provider.embed_texts
            )

    elif connector_type == "rest_api":
        from src.system_indexer.connectors.rest_api import RestApiConnector

        connector = RestApiConnector()
        system = await session.get(IndexedSystem, system_id)
        if not system or not system.base_url:
            logger.error("Cannot index system %s: missing base_url", system_id)
            return

        system_index = await connector.index({"spec_url": system.base_url})

        if action == "reindex":
            await incremental_reindex(
                system_id, system_index, session, provider.embed_texts
            )
        else:
            await index_system(
                system_id, system_index, session, provider.embed_texts
            )

    else:
        logger.warning("Unknown connector type: %s", connector_type)


async def _mark_failed(session, system_id: str) -> None:
    from src.system_indexer.db_models import IndexedSystem

    system = await session.get(IndexedSystem, system_id)
    if system:
        system.status = "failed"
