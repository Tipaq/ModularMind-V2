"""SQL database connector — introspects schema via information_schema."""

from __future__ import annotations

import hashlib
import logging
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from src.system_indexer.connector_base import BaseSystemConnector
from src.system_indexer.models import Relationship, StructuralUnit

logger = logging.getLogger(__name__)


class DatabaseConnector(BaseSystemConnector):
    """Discovers tables, columns, and foreign keys from a PostgreSQL database."""

    def __init__(self) -> None:
        self._engine = None
        self._tables: list[StructuralUnit] = []
        self._columns: list[StructuralUnit] = []
        self._table_id_map: dict[str, str] = {}

    async def connect(self, config: dict) -> bool:
        database_url = config.get("database_url", "")
        if not database_url:
            return False
        try:
            self._engine = create_async_engine(database_url, echo=False)
            async with self._engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            logger.exception("Database connection failed")
            return False

    async def discover_structure(self) -> list[StructuralUnit]:
        if not self._engine:
            return []

        self._tables = []
        self._columns = []
        self._table_id_map = {}

        async with self._engine.connect() as conn:
            await self._discover_tables(conn)
            await self._discover_columns(conn)

        return [*self._tables, *self._columns]

    async def discover_relationships(self) -> list[Relationship]:
        if not self._engine:
            return []

        relationships: list[Relationship] = []
        async with self._engine.connect() as conn:
            fk_rows = await conn.execute(
                text(
                    "SELECT tc.table_name, kcu.column_name, "
                    "ccu.table_name AS foreign_table "
                    "FROM information_schema.table_constraints tc "
                    "JOIN information_schema.key_column_usage kcu "
                    "ON tc.constraint_name = kcu.constraint_name "
                    "JOIN information_schema.constraint_column_usage ccu "
                    "ON ccu.constraint_name = tc.constraint_name "
                    "WHERE tc.constraint_type = 'FOREIGN KEY' "
                    "AND tc.table_schema = 'public'"
                )
            )
            for row in fk_rows:
                source_table = row[0]
                column_name = row[1]
                target_table = row[2]
                source_id = self._table_id_map.get(source_table)
                target_id = self._table_id_map.get(target_table)
                if source_id and target_id:
                    relationships.append(
                        Relationship(
                            source_id=source_id,
                            target_id=target_id,
                            kind="foreign_key",
                            weight=1.0,
                            metadata={"column": column_name},
                        )
                    )

        for table in self._tables:
            for col in self._columns:
                if col.parent_id == table.id:
                    relationships.append(
                        Relationship(
                            source_id=table.id,
                            target_id=col.id,
                            kind="has_field",
                            weight=1.0,
                        )
                    )

        return relationships

    async def health_check(self) -> bool:
        if not self._engine:
            return False
        try:
            async with self._engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    async def _discover_tables(self, conn: AsyncSession) -> None:
        rows = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        )
        for row in rows:
            table_name = row[0]
            uid = str(uuid4())
            self._table_id_map[table_name] = uid
            body = f"TABLE {table_name}"
            self._tables.append(
                StructuralUnit(
                    id=uid,
                    system_id="",
                    kind="table",
                    name=table_name,
                    qualified_name=f"public.{table_name}",
                    summary=f"Database table: {table_name}",
                    signature=f"TABLE public.{table_name}",
                    body_hash=hashlib.sha256(body.encode()).hexdigest()[:16],
                    depth=0,
                    metadata={"schema": "public"},
                )
            )

    async def _discover_columns(self, conn: AsyncSession) -> None:
        rows = await conn.execute(
            text(
                "SELECT table_name, column_name, data_type, is_nullable, "
                "column_default "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "ORDER BY table_name, ordinal_position"
            )
        )
        for row in rows:
            table_name, col_name, data_type, nullable, default = row
            parent_id = self._table_id_map.get(table_name)
            if not parent_id:
                continue
            uid = str(uuid4())
            sig = f"{data_type}"
            if nullable == "NO":
                sig += " NOT NULL"
            if default:
                sig += f" DEFAULT {default}"
            body = f"{table_name}.{col_name} {sig}"
            self._columns.append(
                StructuralUnit(
                    id=uid,
                    system_id="",
                    kind="field",
                    name=col_name,
                    qualified_name=f"public.{table_name}.{col_name}",
                    summary=f"Column {col_name} of {table_name} ({data_type})",
                    signature=sig,
                    body_hash=hashlib.sha256(body.encode()).hexdigest()[:16],
                    depth=1,
                    parent_id=parent_id,
                    metadata={
                        "table": table_name,
                        "data_type": data_type,
                        "nullable": nullable == "YES",
                    },
                )
            )
