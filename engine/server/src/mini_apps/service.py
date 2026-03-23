"""Mini-apps service — business logic for agent-created web applications."""

from __future__ import annotations

import contextlib
import json
import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.query_utils import escape_like
from src.infra.utils import utcnow

from .models import MiniApp, MiniAppFile, MiniAppScope, MiniAppSnapshot, MiniAppStorage

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 1_048_576
MAX_STORAGE_VALUE_SIZE = 65_536
MAX_STORAGE_KEYS = 500
MAX_SNAPSHOTS = 20


class MiniAppService:
    """CRUD + file/storage/snapshot operations for mini-apps."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── App CRUD ─────────────────────────────────────────────────────────

    async def create_app(
        self,
        name: str,
        slug: str,
        description: str = "",
        scope: MiniAppScope = MiniAppScope.PERSONAL,
        allowed_groups: list[str] | None = None,
        owner_user_id: str | None = None,
        agent_id: str | None = None,
        initial_html: str | None = None,
    ) -> MiniApp:
        app = MiniApp(
            id=str(uuid4()),
            name=name,
            slug=slug,
            description=description,
            scope=scope,
            allowed_groups=allowed_groups or [],
            owner_user_id=owner_user_id,
            agent_id=agent_id,
        )
        self._db.add(app)
        await self._db.flush()

        if initial_html:
            await self._write_file_internal(app.id, "index.html", initial_html, "text/html")

        return app

    async def get_app(self, app_id: str) -> MiniApp | None:
        result = await self._db.execute(
            select(MiniApp).where(MiniApp.id == app_id),
        )
        return result.scalar_one_or_none()

    async def list_apps(
        self,
        scope: str | None = None,
        agent_id: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[MiniApp], int]:
        query = select(MiniApp)
        count_query = select(func.count(MiniApp.id))

        if scope:
            query = query.where(MiniApp.scope == scope)
            count_query = count_query.where(MiniApp.scope == scope)
        if agent_id:
            query = query.where(MiniApp.agent_id == agent_id)
            count_query = count_query.where(MiniApp.agent_id == agent_id)
        if search:
            escaped = escape_like(search)
            pattern = f"%{escaped}%"
            filter_clause = MiniApp.name.ilike(pattern, escape="\\")
            query = query.where(filter_clause)
            count_query = count_query.where(filter_clause)

        total = (await self._db.execute(count_query)).scalar() or 0

        query = query.order_by(MiniApp.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self._db.execute(query)
        return list(result.scalars().all()), total

    async def update_app(self, app_id: str, data: dict[str, Any]) -> MiniApp | None:
        values = {k: v for k, v in data.items() if v is not None}
        if not values:
            return await self.get_app(app_id)

        values["updated_at"] = utcnow()
        await self._db.execute(
            update(MiniApp).where(MiniApp.id == app_id).values(**values),
        )
        await self._db.flush()
        return await self.get_app(app_id)

    async def delete_app(self, app_id: str) -> bool:
        app = await self.get_app(app_id)
        if not app:
            return False
        await self._db.delete(app)
        await self._db.flush()
        return True

    # ── Files ────────────────────────────────────────────────────────────

    async def write_file(
        self,
        app_id: str,
        path: str,
        content: str,
        content_type: str = "text/plain",
    ) -> dict[str, Any]:
        if len(content) > MAX_FILE_SIZE:
            raise ValueError(f"File exceeds max size ({MAX_FILE_SIZE} bytes)")

        existing = await self._get_file(app_id, path)
        if existing:
            with contextlib.suppress(Exception):
                await self.create_snapshot(app_id, f"auto: before updating {path}")

        return await self._write_file_internal(app_id, path, content, content_type)

    async def _write_file_internal(
        self,
        app_id: str,
        path: str,
        content: str,
        content_type: str,
    ) -> dict[str, Any]:
        existing = await self._get_file(app_id, path)
        now = utcnow()

        if existing:
            existing.content = content
            existing.size_bytes = len(content)
            existing.content_type = content_type
            existing.updated_at = now
        else:
            file = MiniAppFile(
                id=str(uuid4()),
                app_id=app_id,
                path=path,
                content=content,
                size_bytes=len(content),
                content_type=content_type,
            )
            self._db.add(file)

        await self._db.execute(
            update(MiniApp)
            .where(MiniApp.id == app_id)
            .values(version=MiniApp.version + 1, updated_at=now),
        )
        await self._db.flush()
        return {"path": path, "size": len(content)}

    async def read_file(
        self,
        app_id: str,
        path: str,
    ) -> dict[str, str] | None:
        file = await self._get_file(app_id, path)
        if not file:
            return None
        return {"content": file.content, "content_type": file.content_type}

    async def delete_file(self, app_id: str, path: str) -> bool:
        file = await self._get_file(app_id, path)
        if not file:
            return False
        await self._db.delete(file)
        await self._db.flush()
        return True

    async def list_files(self, app_id: str) -> list[MiniAppFile]:
        result = await self._db.execute(
            select(MiniAppFile).where(MiniAppFile.app_id == app_id).order_by(MiniAppFile.path),
        )
        return list(result.scalars().all())

    async def _get_file(self, app_id: str, path: str) -> MiniAppFile | None:
        result = await self._db.execute(
            select(MiniAppFile).where(
                MiniAppFile.app_id == app_id,
                MiniAppFile.path == path,
            ),
        )
        return result.scalar_one_or_none()

    # ── Storage ──────────────────────────────────────────────────────────

    async def set_storage_value(
        self,
        app_id: str,
        key: str,
        value: Any,
    ) -> None:
        json_str = json.dumps(value)
        if len(json_str) > MAX_STORAGE_VALUE_SIZE:
            raise ValueError(f"Storage value exceeds max size ({MAX_STORAGE_VALUE_SIZE} bytes)")

        existing = await self._get_storage_entry(app_id, key)
        if not existing:
            count_result = await self._db.execute(
                select(func.count(MiniAppStorage.id)).where(MiniAppStorage.app_id == app_id),
            )
            count = count_result.scalar() or 0
            if count >= MAX_STORAGE_KEYS:
                raise ValueError(f"Storage limit reached ({MAX_STORAGE_KEYS} keys)")

            entry = MiniAppStorage(
                id=str(uuid4()),
                app_id=app_id,
                key=key,
                value=value,
            )
            self._db.add(entry)
        else:
            existing.value = value
            existing.updated_at = utcnow()

        await self._db.flush()

    async def get_storage_value(
        self,
        app_id: str,
        key: str,
    ) -> Any | None:
        entry = await self._get_storage_entry(app_id, key)
        return entry.value if entry else None

    async def delete_storage_value(self, app_id: str, key: str) -> bool:
        entry = await self._get_storage_entry(app_id, key)
        if not entry:
            return False
        await self._db.delete(entry)
        await self._db.flush()
        return True

    async def list_storage_keys(self, app_id: str) -> list[MiniAppStorage]:
        result = await self._db.execute(
            select(MiniAppStorage)
            .where(MiniAppStorage.app_id == app_id)
            .order_by(MiniAppStorage.key),
        )
        return list(result.scalars().all())

    async def _get_storage_entry(
        self,
        app_id: str,
        key: str,
    ) -> MiniAppStorage | None:
        result = await self._db.execute(
            select(MiniAppStorage).where(
                MiniAppStorage.app_id == app_id,
                MiniAppStorage.key == key,
            ),
        )
        return result.scalar_one_or_none()

    # ── Snapshots ────────────────────────────────────────────────────────

    async def create_snapshot(
        self,
        app_id: str,
        label: str | None = None,
    ) -> MiniAppSnapshot:
        app = await self.get_app(app_id)
        if not app:
            raise ValueError("App not found")

        files = await self.list_files(app_id)
        file_manifest = [
            {
                "path": f.path,
                "content": f.content,
                "size": f.size_bytes,
                "contentType": f.content_type,
            }
            for f in files
        ]

        count_result = await self._db.execute(
            select(func.count(MiniAppSnapshot.id)).where(MiniAppSnapshot.app_id == app_id),
        )
        count = count_result.scalar() or 0
        if count >= MAX_SNAPSHOTS:
            oldest = await self._db.execute(
                select(MiniAppSnapshot)
                .where(MiniAppSnapshot.app_id == app_id)
                .order_by(MiniAppSnapshot.created_at)
                .limit(1),
            )
            oldest_snap = oldest.scalar_one_or_none()
            if oldest_snap:
                await self._db.delete(oldest_snap)

        snapshot = MiniAppSnapshot(
            id=str(uuid4()),
            app_id=app_id,
            version=app.version,
            label=label,
            file_manifest=file_manifest,
        )
        self._db.add(snapshot)
        await self._db.flush()
        return snapshot

    async def list_snapshots(self, app_id: str) -> list[MiniAppSnapshot]:
        result = await self._db.execute(
            select(MiniAppSnapshot)
            .where(MiniAppSnapshot.app_id == app_id)
            .order_by(MiniAppSnapshot.version.desc()),
        )
        return list(result.scalars().all())

    async def rollback_snapshot(
        self,
        app_id: str,
        version: int,
    ) -> dict[str, int]:
        result = await self._db.execute(
            select(MiniAppSnapshot).where(
                MiniAppSnapshot.app_id == app_id,
                MiniAppSnapshot.version == version,
            ),
        )
        snapshot = result.scalar_one_or_none()
        if not snapshot:
            raise ValueError("Snapshot not found")

        await self.create_snapshot(app_id, f"auto-backup before rollback to v{version}")

        await self._db.execute(
            delete(MiniAppFile).where(MiniAppFile.app_id == app_id),
        )

        manifest: list[dict[str, Any]] = snapshot.file_manifest
        for entry in manifest:
            file = MiniAppFile(
                id=str(uuid4()),
                app_id=app_id,
                path=entry["path"],
                content=entry["content"],
                size_bytes=entry["size"],
                content_type=entry["contentType"],
            )
            self._db.add(file)

        await self._db.execute(
            update(MiniApp)
            .where(MiniApp.id == app_id)
            .values(version=MiniApp.version + 1, updated_at=utcnow()),
        )
        await self._db.flush()
        return {"restored": len(manifest)}

    # ── Serve ────────────────────────────────────────────────────────────

    async def render_serve_html(
        self,
        app_id: str,
        theme: str | None = None,
    ) -> str | None:
        app = await self.get_app(app_id)
        if not app or not app.is_active:
            return None

        entry = await self.read_file(app_id, app.entry_file)
        if not entry:
            return None

        dark_class = ' class="dark"' if theme == "dark" else ""

        return f"""<!DOCTYPE html>
<html lang="en"{dark_class}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{app.name}</title>
  <script>
    window.__MM_APP_ID__ = "{app_id}";
    window.addEventListener("message", function(e) {{
      if (e.data && e.data.source === "modularmind-parent" && e.data.type === "theme-changed") {{
        document.documentElement.classList.toggle("dark", e.data.data === "dark");
      }}
      if (e.data && e.data.source === "modularmind-parent" && e.data.type === "initialized") {{
        var t = e.data.data && e.data.data.theme;
        document.documentElement.classList.toggle("dark", t === "dark");
      }}
    }});
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (!document.documentElement.classList.contains("dark") && prefersDark) {{
      document.documentElement.classList.add("dark");
    }}
  </script>
</head>
<body>
  {entry["content"]}
</body>
</html>"""
