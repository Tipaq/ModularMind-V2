"""SPA-aware static file serving for FastAPI."""

from pathlib import Path

from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from starlette.types import Scope


class SPAStaticFiles(StaticFiles):
    """Serve static files with SPA fallback (returns index.html for unknown paths)."""

    async def get_response(self, path: str, scope: Scope):
        try:
            return await super().get_response(path, scope)
        except Exception:
            # SPA fallback: return index.html for client-side routing
            index = Path(self.directory) / "index.html"
            if index.exists():
                return FileResponse(index, media_type="text/html")
            raise
