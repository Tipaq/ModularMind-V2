# Guide de tests — Unitaires et intégration

## Stack de tests

### Python (Backend)
- **Framework** : pytest + pytest-asyncio
- **Mocking** : unittest.mock, pytest-mock
- **Coverage** : pytest-cov (objectif : 80%)
- **Fixtures** : Factories avec SQLAlchemy

### TypeScript (Frontend)
- **Framework** : Vitest
- **DOM Testing** : @testing-library/react
- **Mocking** : vi.mock, MSW (Mock Service Worker)
- **Coverage** : v8 (objectif : 70%)

## Structure des tests Python

```
engine/server/tests/
├── conftest.py              # Fixtures globales (DB session, test client)
├── unit/
│   ├── test_fact_extractor.py
│   ├── test_chunker.py
│   └── test_scorer.py
├── integration/
│   ├── test_rag_pipeline.py
│   ├── test_memory_repository.py
│   └── test_auth_flow.py
└── fixtures/
    ├── agents.py
    ├── documents.py
    └── users.py
```

### Fixtures globales (conftest.py)

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

@pytest.fixture
async def db_session():
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost/test_mm")
    async with AsyncSession(engine) as session:
        yield session
        await session.rollback()

@pytest.fixture
async def api_client(db_session):
    from src.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

@pytest.fixture
def sample_user():
    return {
        "id": "usr_test01",
        "email": "test@modularmind.io",
        "name": "Test User",
        "role": "admin",
        "groups": ["engineering"],
    }
```

### Test unitaire (exemple)

```python
import pytest
from src.rag.chunker import TokenAwareChunker

class TestTokenAwareChunker:
    def setup_method(self):
        self.chunker = TokenAwareChunker(chunk_size_tokens=100, overlap_tokens=20)

    def test_chunk_short_text(self):
        text = "Hello world. This is a short text."
        chunks = self.chunker.chunk(text)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_chunk_long_text_produces_overlap(self):
        text = "word " * 500  # ~500 tokens
        chunks = self.chunker.chunk(text)
        assert len(chunks) > 1
        # Verify overlap exists between consecutive chunks
        for i in range(len(chunks) - 1):
            end_of_current = chunks[i][-50:]
            start_of_next = chunks[i + 1][:50]
            assert any(word in start_of_next for word in end_of_current.split())

    def test_chunk_empty_text(self):
        chunks = self.chunker.chunk("")
        assert chunks == []
```

### Test d'intégration (exemple)

```python
import pytest

@pytest.mark.asyncio
async def test_rag_search_respects_scope(api_client, db_session):
    # Setup: create a GROUP-scoped collection
    collection = await create_collection(db_session, scope="group", groups=["engineering"])
    await create_document(db_session, collection.id, content="ModularMind architecture")

    # Test: user in "engineering" group can search
    response = await api_client.post("/rag/search", json={
        "query": "architecture",
        "collection_ids": [str(collection.id)]
    }, cookies={"access_token": engineer_token})
    assert response.status_code == 200
    assert len(response.json()["results"]) > 0

    # Test: user NOT in "engineering" group cannot search
    response = await api_client.post("/rag/search", json={
        "query": "architecture",
        "collection_ids": [str(collection.id)]
    }, cookies={"access_token": sales_token})
    assert response.status_code == 200
    assert len(response.json()["results"]) == 0  # Filtered out
```

## Commandes

```bash
# Tous les tests Python
make test

# Tests avec couverture
pytest engine/server/tests/ -v --cov=src --cov-report=html

# Tests spécifiques
pytest engine/server/tests/unit/test_chunker.py -v

# Tests TypeScript
pnpm turbo test

# Tests d'un package spécifique
cd packages/ui && pnpm test
```

## Bonnes pratiques

1. **Un test = un comportement** : Chaque test vérifie un seul comportement
2. **Noms descriptifs** : `test_search_returns_empty_when_user_lacks_group_access`
3. **Arrange-Act-Assert** : Structure claire en 3 parties
4. **Pas de tests fragiles** : Évitez les assertions sur les timestamps ou les ordres non garantis
5. **Fixtures réutilisables** : Utilisez les factories pour créer les données de test
6. **Isolation** : Chaque test doit pouvoir s'exécuter indépendamment