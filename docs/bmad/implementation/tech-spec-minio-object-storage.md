---
title: 'MinIO Object Storage Integration & Persistent RAG File Storage'
slug: 'minio-object-storage'
created: '2026-03-04'
status: 'in-progress'
stepsCompleted: []
tech_stack:
  - Python 3.12 / FastAPI
  - MinIO (S3-compatible object storage)
  - boto3 / aiobotocore (async S3 client)
  - Docker Compose
  - SQLAlchemy (async) + PostgreSQL
  - Redis Streams (event bus)
files_to_modify:
  - engine/server/src/infra/config.py
  - engine/server/src/infra/object_store.py (new)
  - engine/server/src/rag/router.py
  - engine/server/src/rag/models.py
  - engine/server/src/rag/processor.py
  - engine/server/src/rag/schemas.py
  - engine/server/src/worker/tasks.py
  - docker/docker-compose.dev.yml
  - docker/docker-compose.yml
  - engine/server/requirements.txt (or pyproject.toml)
code_patterns:
  - Pydantic-settings for env vars (config.py Settings class)
  - Docker Compose service + volume + healthcheck
  - Singleton factory pattern (like QdrantClientFactory in infra/qdrant.py)
  - Redis Streams task handler (worker/tasks.py document_process_handler)
  - FastAPI UploadFile + streaming write
test_patterns:
  - pytest + pytest-asyncio for async tests
  - Mocked S3 client (moto or manual mock)
  - Integration test with MinIO testcontainer
---

# Tech-Spec: MinIO Object Storage Integration & Persistent RAG File Storage

**Created:** 2026-03-04

## Overview

### Problem Statement

Currently, uploaded RAG documents are written to a temp directory (`{CONFIG_DIR}/uploads/`) on the engine/worker container filesystem and **deleted after processing** (`os.unlink(tmp_path)` in `worker/tasks.py`). This means:

1. **No re-processing**: If the embedding model or chunking strategy changes, users must re-upload every document
2. **No download**: The original document cannot be served back to the user (e.g., for preview or audit)
3. **Ephemeral storage**: In Docker containers without persistent volumes for `/data/config/uploads`, files are lost on container restart even before processing
4. **Single-node only**: Temp filesystem doesn't work in multi-instance deployments (engine and worker must share the same filesystem)
5. **No lifecycle management**: No retention policies, no versioning, no backup strategy

Additionally, the upcoming chat attachments feature (separate spec) will also need persistent object storage. Implementing MinIO now provides the foundation for both use cases.

### Solution

Add **MinIO** as a new infrastructure service (S3-compatible object storage) and create an `ObjectStore` abstraction layer in the engine. Replace the current temp-file workflow with:

1. Upload → stream to MinIO (bucket: `rag-documents`)
2. Worker reads from MinIO instead of filesystem
3. Original file persisted in MinIO permanently
4. New download endpoint serves files from MinIO
5. Same `ObjectStore` reused by chat attachments (separate spec)

### Scope

**In Scope:**

- MinIO container in Docker Compose (dev + prod)
- `ObjectStore` service class with async S3 operations (upload, download, delete, presigned URL)
- Settings in `config.py` for S3/MinIO connection (`S3_ENDPOINT`, `S3_ACCESS_KEY`, etc.)
- Migrate RAG upload flow: stream to MinIO instead of temp file
- Persist `object_key` in `RAGDocument.meta` (replaces temp `file_path`)
- Worker reads file from MinIO for processing
- Stop deleting files after processing (remove `os.unlink`)
- New endpoint: `GET /rag/documents/{document_id}/download` (serves original file)
- New endpoint: `DELETE /rag/documents/{document_id}` (deletes file from MinIO + DB records)
- Bucket auto-creation on startup with lifecycle policies
- Health check for MinIO in Docker Compose

**Out of Scope:**

- Chat attachment storage (separate tech-spec, but will use same `ObjectStore`)
- MinIO clustering / distributed mode (single-node is sufficient for now)
- MinIO Console UI exposure (use CLI or API only)
- Versioning / deduplication of identical files
- Virus scanning / content validation beyond file extension
- Migration tool for existing temp files (none persist anyway)
- Presigned URLs for direct browser upload (uploads go through engine)
- Fine-tuning file storage migration (separate concern)

## Context for Development

### Codebase Patterns

**Infrastructure services follow a consistent pattern:**
- Config in `infra/config.py` as `Settings` fields with defaults + validators
- Docker Compose: `x-engine-env` anchor for shared env vars, `service_healthy` conditions
- Factory/singleton pattern for clients (see `QdrantClientFactory` in `infra/qdrant.py`)
- Health checks: TCP/HTTP checks with interval/timeout/retries

**File upload flow (current):**
1. `rag/router.py:upload_document_endpoint` streams `UploadFile` to temp file (64KB chunks)
2. Creates `RAGDocument(status=PROCESSING, meta={"file_path": tmp_path})`
3. Publishes to `tasks:documents` Redis Stream with `file_path`
4. `worker/tasks.py:document_process_handler` reads file, calls `process_document()`, deletes file

**Env var pattern:**
- All settings use `SCREAMING_SNAKE_CASE`
- Optional passwords: empty string default
- URLs: full protocol + host + port
- Docker Compose: interpolated from `${VAR:-default}` or `&engine-env` anchor

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `engine/server/src/infra/config.py` | Settings class — add S3/MinIO env vars here |
| `engine/server/src/infra/qdrant.py` | Reference: singleton client factory pattern |
| `engine/server/src/rag/router.py` | Upload endpoint (lines 188-285) — refactor to use ObjectStore |
| `engine/server/src/rag/models.py` | RAGDocument model — `meta` JSONB field stores file_path |
| `engine/server/src/rag/processor.py` | `process_document()` accepts `file_content: bytes` |
| `engine/server/src/rag/schemas.py` | DocumentResponse — add `download_url` field |
| `engine/server/src/worker/tasks.py` | `document_process_handler` — replace filesystem read with S3 read |
| `docker/docker-compose.dev.yml` | Dev infra — add MinIO service |
| `docker/docker-compose.yml` | Prod deployment — add MinIO service + volume |

### Technical Decisions

1. **MinIO over alternatives**: MinIO is S3-compatible (same `boto3`/`aiobotocore` SDK), runs as a single Docker container, has excellent performance for object storage, and is production-grade. If the user later migrates to AWS S3 or any S3-compatible service, only the endpoint URL changes — zero code changes.

2. **`aiobotocore` for async S3 operations**: The engine is fully async (FastAPI + asyncpg + aioredis). Using `aiobotocore` (async wrapper over `botocore`) keeps the S3 operations non-blocking. Alternative `boto3` would require `run_in_executor` for every call.

3. **Object key format**: `rag/{collection_id}/{document_id}/{filename}` — hierarchical, allows listing all documents in a collection, preserves original filename for Content-Disposition header on download.

4. **Single bucket per concern**: `rag-documents` for RAG files, `chat-attachments` for chat (future). Not one mega-bucket with prefixes — this allows independent lifecycle policies and access rules.

5. **Stream-through upload (no temp file)**: The upload endpoint streams the `UploadFile` directly to MinIO using multipart upload. No intermediate temp file on the engine filesystem. This eliminates the filesystem dependency entirely.

6. **Worker reads from MinIO**: The Redis Streams payload changes from `file_path` (local path) to `object_key` (S3 key). The worker downloads the file content from MinIO. This works across multi-instance deployments.

7. **No presigned URLs for uploads**: Users upload through the engine API (which validates auth, file type, size). Presigned URLs would bypass these checks. Presigned URLs are used only for downloads (optional optimization for large files).

8. **Keep file after processing**: The `os.unlink()` in `document_process_handler` is removed. Files live in MinIO indefinitely. Deletion only happens when the user explicitly deletes a document via API.

## Implementation Plan

### Tasks

#### Phase 1: Infrastructure (MinIO + ObjectStore)

- [ ] Task 1: Add MinIO to Docker Compose
  - Files: `docker/docker-compose.dev.yml`, `docker/docker-compose.yml`
  - Action (dev):
    ```yaml
    minio:
      image: minio/minio:latest
      command: server /data --console-address ":9001"
      ports:
        - "9000:9000"   # S3 API
        - "9001:9001"   # Console (dev only)
      environment:
        MINIO_ROOT_USER: modularmind
        MINIO_ROOT_PASSWORD: modularmind
      healthcheck:
        test: ["CMD", "mc", "ready", "local"]
        interval: 5s
        timeout: 3s
        retries: 5
    ```
  - Action (prod):
    ```yaml
    minio:
      image: minio/minio:latest
      command: server /data
      volumes: [minio-data:/data]
      environment:
        MINIO_ROOT_USER: ${S3_ACCESS_KEY:-modularmind}
        MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
      healthcheck:
        test: ["CMD", "mc", "ready", "local"]
        interval: 10s
        timeout: 5s
        retries: 5
    ```
  - Add `minio-data` to volumes in prod
  - Add `minio: { condition: service_healthy }` to `x-engine-depends`
  - Add S3 env vars to `x-engine-env`:
    ```yaml
    S3_ENDPOINT: http://minio:9000
    S3_ACCESS_KEY: modularmind
    S3_SECRET_KEY: modularmind
    S3_REGION: us-east-1
    ```

- [ ] Task 2: Add S3/MinIO settings to config.py
  - File: `engine/server/src/infra/config.py`
  - Action: Add to `Settings` class after the Qdrant section:
    ```python
    # ---- Object Storage (S3 / MinIO) -----------------------------------------
    S3_ENDPOINT: str = Field(
        default="http://localhost:9000",
        description="S3-compatible endpoint URL (MinIO or AWS S3)",
    )
    S3_ACCESS_KEY: str = Field(default="modularmind")
    S3_SECRET_KEY: str = Field(default="modularmind")
    S3_REGION: str = Field(default="us-east-1")
    S3_BUCKET_RAG: str = Field(
        default="rag-documents",
        description="Bucket for RAG document originals",
    )
    S3_BUCKET_ATTACHMENTS: str = Field(
        default="chat-attachments",
        description="Bucket for chat message attachments",
    )
    S3_PRESIGNED_EXPIRY: int = Field(
        default=3600, ge=60, le=86400,
        description="Presigned URL expiry in seconds",
    )
    ```

- [ ] Task 3: Create ObjectStore service
  - File: `engine/server/src/infra/object_store.py` (new)
  - Action: Create an async S3 client wrapper using `aiobotocore`:
    ```python
    class ObjectStore:
        """Async S3-compatible object storage client."""

        async def upload(
            self, bucket: str, key: str, data: AsyncIterator[bytes],
            content_type: str, content_length: int,
        ) -> str:
            """Upload an object via streaming. Returns the object key."""

        async def download(self, bucket: str, key: str) -> bytes:
            """Download an object's full content."""

        async def download_stream(
            self, bucket: str, key: str,
        ) -> AsyncIterator[bytes]:
            """Stream an object in chunks (for large file downloads)."""

        async def delete(self, bucket: str, key: str) -> None:
            """Delete an object."""

        async def presigned_url(
            self, bucket: str, key: str, expires_in: int,
        ) -> str:
            """Generate a presigned download URL."""

        async def ensure_buckets(self) -> None:
            """Create buckets if they don't exist (called on startup)."""

        async def head(self, bucket: str, key: str) -> dict:
            """Get object metadata (size, content_type) without downloading."""
    ```
  - Use singleton pattern: module-level `_object_store: ObjectStore | None` with `get_object_store()` factory
  - Session created via `aiobotocore.session.get_session()` with config from settings
  - `ensure_buckets()` called from engine startup (`main.py` lifespan) and worker startup (`runner.py`)
  - All methods use `async with session.create_client('s3', ...)` context manager
  - Notes: The `upload` method uses `put_object` for files under 100MB (our max is 50MB so always single-part). No need for multipart upload complexity at this size.

- [ ] Task 4: Add `aiobotocore` dependency
  - File: `engine/server/requirements.txt` or `pyproject.toml`
  - Action: Add `aiobotocore>=2.12.0`
  - Notes: `aiobotocore` pulls in `botocore` and `aiohttp` as transitive deps

- [ ] Task 5: Call `ensure_buckets()` on startup
  - Files: `engine/server/src/main.py` (lifespan), `engine/server/src/worker/runner.py` (startup)
  - Action: In the lifespan context manager and worker startup, call:
    ```python
    from src.infra.object_store import get_object_store
    store = get_object_store()
    await store.ensure_buckets()
    ```
  - This creates `rag-documents` and `chat-attachments` buckets if missing

#### Phase 2: Migrate RAG Upload Flow

- [ ] Task 6: Refactor upload endpoint to stream to MinIO
  - File: `engine/server/src/rag/router.py`
  - Action: Replace the temp-file write logic (lines 224-240) with:
    ```python
    object_key = f"rag/{collection_id}/{doc_id}/{filename}"
    store = get_object_store()

    # Stream UploadFile content to memory buffer (capped at MAX_FILE_SIZE)
    # then upload to MinIO
    chunks = []
    total_size = 0
    while chunk := await file.read(64 * 1024):
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise HTTPException(413, f"File exceeds {MAX_FILE_SIZE // (1024*1024)}MB limit")
        chunks.append(chunk)

    file_bytes = b"".join(chunks)
    await store.upload(
        bucket=settings.S3_BUCKET_RAG,
        key=object_key,
        data=file_bytes,
        content_type=file.content_type or "application/octet-stream",
        content_length=total_size,
    )
    ```
  - Update `RAGDocument` creation: `meta={"object_key": object_key}` (replaces `file_path`)
  - Update Redis Streams payload: `"object_key": object_key` (replaces `"file_path": tmp_path`)
  - Remove: `tempfile.mkstemp`, `os.write`, `os.close`, `os.makedirs(upload_dir)`, all temp file logic
  - Notes: For files up to 50MB, buffering in memory is acceptable (engine already holds the full `UploadFile` in memory via FastAPI). The `upload` method on ObjectStore accepts `bytes` directly for simplicity.

- [ ] Task 7: Update worker to read from MinIO
  - File: `engine/server/src/worker/tasks.py`
  - Action: In `document_process_handler`:
    ```python
    # Before (filesystem):
    # with open(file_path, "rb") as f:
    #     file_content = f.read()

    # After (MinIO):
    object_key = data.get("object_key", "")
    store = get_object_store()
    file_content = await store.download(
        bucket=settings.S3_BUCKET_RAG,
        key=object_key,
    )
    ```
  - **Remove** the `os.unlink(file_path)` block entirely (lines ~238-242)
  - Keep error handling: if download fails, set document status to FAILED
  - Notes: The `process_document()` function signature doesn't change — it already accepts `file_content: bytes`

- [ ] Task 8: Add download endpoint
  - File: `engine/server/src/rag/router.py`
  - Action: Add new endpoint:
    ```python
    @router.get("/documents/{document_id}/download")
    async def download_document(
        document_id: str,
        user: CurrentUser,
        user_groups: CurrentUserGroups,
        db: DbSession,
    ) -> StreamingResponse:
        """Download the original document file."""
    ```
  - Logic:
    1. Load `RAGDocument` from DB (verify it exists and status != FAILED)
    2. ACL check: verify user has access to the parent collection (same check as list_documents)
    3. Read `object_key` from `document.meta["object_key"]`
    4. Stream from MinIO via `store.download_stream()`
    5. Return `StreamingResponse` with `Content-Disposition: attachment; filename="{document.filename}"` and appropriate `Content-Type`
  - Notes: For files under 50MB, direct streaming is fine. No need for presigned URL redirect.

- [ ] Task 9: Add delete endpoint with MinIO cleanup
  - File: `engine/server/src/rag/router.py`
  - Action: Add or update:
    ```python
    @router.delete("/documents/{document_id}", status_code=204)
    async def delete_document(
        document_id: str,
        user: CurrentUser,
        user_groups: CurrentUserGroups,
        db: DbSession,
    ) -> None:
        """Delete a document, its chunks, Qdrant vectors, and MinIO file."""
    ```
  - Logic:
    1. Load document + ACL check
    2. Delete Qdrant vectors with filter `document_id == document_id`
    3. Delete MinIO file: `store.delete(bucket, object_key)`
    4. Delete DB records: `RAGChunk` (cascade) + `RAGDocument`
    5. Update collection counters (`document_count`, `chunk_count`)
  - Notes: Qdrant deletion should be best-effort (log warning if fails, don't block DB cleanup)

- [ ] Task 10: Update DocumentResponse schema
  - File: `engine/server/src/rag/schemas.py`
  - Action: Add optional `download_url` field to `DocumentResponse`:
    ```python
    class DocumentResponse(BaseModel):
        # ... existing fields ...
        has_original: bool = False  # True if object_key exists in meta
    ```
  - The download URL is constructed by the frontend using the document ID: `GET /rag/documents/{id}/download`. No need to embed it in the response — keeps the schema clean.

#### Phase 3: Backward Compatibility & Cleanup

- [ ] Task 11: Handle legacy documents (no object_key)
  - File: `engine/server/src/worker/tasks.py`
  - Action: In `document_process_handler`, support both paths:
    ```python
    object_key = data.get("object_key")
    file_path = data.get("file_path")

    if object_key:
        file_content = await store.download(settings.S3_BUCKET_RAG, object_key)
    elif file_path:
        # Legacy: read from filesystem (backward compat during transition)
        with open(file_path, "rb") as f:
            file_content = f.read()
        # Clean up legacy temp file
        try:
            os.unlink(file_path)
        except OSError:
            pass
    else:
        raise ValueError("No object_key or file_path in task data")
    ```
  - Notes: This handles any in-flight tasks in Redis Streams during deployment. After one deployment cycle, all new documents use `object_key`. The legacy path can be removed in a future cleanup.

- [ ] Task 12: Add re-processing endpoint
  - File: `engine/server/src/rag/router.py`
  - Action: Add endpoint to re-process a document (re-chunk + re-embed without re-uploading):
    ```python
    @router.post("/documents/{document_id}/reprocess", status_code=202)
    async def reprocess_document(
        document_id: str,
        user: CurrentUser,
        user_groups: CurrentUserGroups,
        db: DbSession,
    ) -> DocumentResponse:
        """Re-process an existing document (re-chunk + re-embed from original file)."""
    ```
  - Logic:
    1. Load document + ACL check
    2. Verify `object_key` exists in `document.meta` (else 409: "Original file not available")
    3. Delete existing chunks (Qdrant + PG)
    4. Reset `document.status = PROCESSING`, `document.chunk_count = 0`
    5. Publish to `tasks:documents` stream with `object_key`
    6. Return updated document
  - Notes: This is the primary benefit of persisting originals. Users can change chunking strategy or embedding model and re-process without re-uploading.

### Acceptance Criteria

1. **MinIO starts** in Docker Compose (dev + prod) and is healthy before engine/worker
2. **Upload** streams to MinIO, no temp files created on filesystem
3. **Processing** reads from MinIO, original file is NOT deleted after success
4. **Download** endpoint returns original file with correct Content-Type and filename
5. **Delete** endpoint cleans up MinIO file + Qdrant vectors + DB records
6. **Re-process** endpoint re-chunks and re-embeds from persisted original
7. **Legacy compat**: in-flight tasks with `file_path` still work during transition
8. **Bucket auto-creation**: buckets are created on startup if missing
9. **Config**: all S3 settings are configurable via environment variables

## Additional Context

### Dependencies

- `aiobotocore>=2.12.0` (async S3 client)
- `minio/minio:latest` Docker image
- No Alembic migration needed (using existing JSONB `meta` field for `object_key`)

### Testing Strategy

- **Unit tests**: Mock `ObjectStore` methods, test upload/download/delete logic in router
- **Integration tests**: Use MinIO testcontainer or real MinIO dev instance
- **Manual test**: Upload a PDF via API, verify in MinIO console (`:9001`), download via new endpoint, delete and verify cleanup

### Notes

- MinIO Console is exposed on `:9001` in dev only (not in prod Docker Compose) for debugging
- The `ObjectStore` class is designed to work with any S3-compatible service. Switching to AWS S3 requires only changing `S3_ENDPOINT` to `https://s3.amazonaws.com` and providing IAM credentials
- File size limit remains 50MB (enforced in router, not in MinIO). MinIO supports files up to 5TB
- The `chat-attachments` bucket is pre-created but unused until the chat attachments spec is implemented
