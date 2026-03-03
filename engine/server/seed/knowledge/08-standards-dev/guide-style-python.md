# Guide de style Python — Backend Engine

## Linter et Formatter

Nous utilisons **ruff** comme linter et formatter unique pour Python :

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.ruff.lint.isort]
known-first-party = ["src", "modularmind_shared"]
```

### Règles activées

| Code | Description |
|------|-------------|
| E | pycodestyle errors |
| F | pyflakes (unused imports, undefined names) |
| I | isort (import ordering) |
| UP | pyupgrade (Python 3.12+ syntax) |
| B | bugbear (common pitfalls) |
| SIM | flake8-simplify (simplification suggestions) |

## Import Ordering

```python
# 1. Standard library
import asyncio
import json
from pathlib import Path
from uuid import uuid4

# 2. Third-party
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from pydantic import BaseModel

# 3. First-party (engine)
from src.auth.dependencies import RequireAuth, RequireAdmin
from src.infra.database import async_session_maker

# 4. Shared schemas
from modularmind_shared.schemas.agents import AgentConfig
```

**Important :** Toujours utiliser `from src.xxx` pour le code engine, jamais `from engine.server.src.xxx`. Pour les schémas partagés, utiliser `from modularmind_shared.xxx`, jamais `from shared.xxx`.

## Type Hints

Nous utilisons les type hints modernes de Python 3.12 :

```python
# Correct — Python 3.12 syntax
def process(items: list[str], config: dict[str, Any] | None = None) -> int: ...

# Incorrect — old syntax
def process(items: List[str], config: Optional[Dict[str, Any]] = None) -> int: ...
```

## Async/Await Conventions

- Toutes les fonctions de service et repository sont `async`
- Utiliser `asyncio.gather()` pour le parallélisme
- Ne jamais bloquer la boucle événementielle avec des appels synchrones
- Utiliser `asyncio.to_thread()` pour les opérations CPU-bound

```python
# Correct
async def get_user(user_id: str) -> User | None:
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

# Incorrect — blocking call in async context
async def get_user(user_id: str) -> User | None:
    return db.session.query(User).get(user_id)  # BLOCKS!
```

## Error Handling

```python
# Custom exceptions in each module
class DocumentNotFoundError(Exception):
    def __init__(self, document_id: str):
        self.document_id = document_id
        super().__init__(f"Document {document_id} not found")

# Router-level error handling
@router.get("/documents/{document_id}")
async def get_document(document_id: str):
    document = await repo.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document
```

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Files | snake_case | `vector_store.py` |
| Classes | PascalCase | `RAGRepository` |
| Functions | snake_case | `process_document` |
| Constants | UPPER_SNAKE | `MAX_CHUNK_SIZE` |
| Private | _prefix | `_validate_input` |
| Async functions | snake_case (no prefix) | `async def fetch_user()` |
| Type aliases | PascalCase | `UserID = str` |