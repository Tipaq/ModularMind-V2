---
title: 'Chat Message Attachments (Multimedia File Support)'
slug: 'chat-attachments'
created: '2026-03-04'
status: 'in-progress'
stepsCompleted: []
tech_stack:
  - Python 3.12 / FastAPI
  - SQLAlchemy (async) + PostgreSQL
  - MinIO / S3 (via ObjectStore from minio-object-storage spec)
  - Redis Streams (event bus)
  - React + Zustand + shadcn/ui (Chat app)
  - Next.js (Platform chat)
  - '@modularmind/api-client'
  - '@modularmind/ui'
files_to_modify:
  - engine/server/src/conversations/models.py
  - engine/server/src/conversations/schemas.py
  - engine/server/src/conversations/router.py
  - engine/server/src/conversations/service.py
  - engine/server/src/infra/object_store.py (from minio spec)
  - engine/server/alembic/versions/xxxx_add_attachments.py (new)
  - apps/chat/src/components/ChatInput.tsx
  - apps/chat/src/pages/Chat.tsx
  - platform/src/components/chat/ChatInput.tsx
  - platform/src/hooks/useChat.ts
  - packages/ui/src/components/chat-messages.tsx
  - packages/api-client/src/index.ts (or conversations.ts)
code_patterns:
  - FastAPI UploadFile + multipart/form-data
  - ObjectStore async S3 operations (from minio-object-storage spec)
  - ConversationMessage JSONB meta field for flexible metadata
  - ChatInput existing file collection UI (onFilesChange, AttachedFile interface)
  - SSE streaming for execution responses
  - Pydantic response models with field aliases
test_patterns:
  - pytest + pytest-asyncio for async tests
  - Mocked ObjectStore
  - Vitest for frontend components
---

# Tech-Spec: Chat Message Attachments (Multimedia File Support)

**Created:** 2026-03-04

**Depends on:** [MinIO Object Storage Integration](tech-spec-minio-object-storage.md) — must be implemented first (provides `ObjectStore` and MinIO infra)

## Overview

### Problem Statement

The chat UI (`apps/chat` and `platform`) already has file attachment UI in `ChatInput.tsx`:
- Paperclip button + drag-and-drop area
- File validation (type + size)
- Preview of attached files before sending
- `AttachedFile` interface with `{ file: File, id: string }`

But **none of this is wired to the backend**:
- `onFilesChange` callback in `ChatInput` is never connected in `Chat.tsx`
- `SendMessageRequest` only accepts `content: str` — no attachment field
- `ConversationMessage` model has no attachment fields (only `content` text + `meta` JSONB)
- No upload endpoint for chat attachments
- No way to render attachments in message bubbles

Users expect to be able to attach files (PDFs, images, documents) to their messages, see them displayed in the conversation, and have the AI agent potentially reference or process them.

### Solution

Implement a complete chat attachment pipeline:

1. **Separate upload endpoint**: `POST /conversations/{id}/attachments` — upload files to MinIO before sending the message (decouples upload from message creation)
2. **Attachment metadata in messages**: `attachments` JSONB array in `ConversationMessage` storing file references (not file content)
3. **Serving endpoint**: `GET /conversations/attachments/{attachment_id}` — stream file from MinIO with auth
4. **Frontend wiring**: Connect `ChatInput` file UI → upload → include attachment IDs in message → render in message bubbles
5. **LLM context**: Optionally extract text from attached documents and include as context in the agent prompt

### Scope

**In Scope:**

- `POST /conversations/{conversation_id}/attachments` endpoint (multipart upload → MinIO)
- `GET /conversations/attachments/{attachment_id}` endpoint (serve file from MinIO)
- `attachments` JSONB column on `ConversationMessage` model
- Alembic migration for new column
- Updated `SendMessageRequest` to accept `attachment_ids: list[str]`
- Updated `MessageResponse` to include `attachments` metadata
- Frontend: wire `ChatInput.onFilesChange` → upload → send with IDs
- Frontend: render attachment chips/previews in message bubbles (both user and assistant messages)
- Image inline preview (thumbnail for images, icon+name for documents)
- Text extraction from attached documents for LLM context (PDF, TXT, MD, DOCX)
- File type validation: documents (PDF, TXT, CSV, MD, JSON, DOCX) + images (PNG, JPG, GIF, WEBP)
- Max file size: 25MB per file, max 5 files per message

**Out of Scope:**

- Audio/video file support (future — requires transcription pipeline)
- Image understanding / vision models (future — requires multimodal LLM integration)
- Inline image generation by AI (separate feature)
- File sharing between conversations
- Attachment search / indexing (attachments are per-message, not searchable globally)
- Drag-and-drop reordering of attachments
- File compression or thumbnail generation (serve originals, let browser handle display)
- Virus/malware scanning (out of scope for V2)

## Context for Development

### Codebase Patterns

**Existing ChatInput file UI** (`apps/chat/src/components/ChatInput.tsx`):
```typescript
export interface AttachedFile {
  file: File;
  id: string;
}

interface ChatInputProps {
  onFilesChange?: (files: AttachedFile[]) => void;
  // ...
}
```
- Already has: hidden `<input type="file">`, Paperclip button, drag-drop zone, file validation
- Already has: `ALLOWED_FILE_TYPES` and `ALLOWED_EXTENSIONS` constants
- Already renders: attached files preview bar with filename, size, remove button
- Missing: actual upload to server, passing attachment IDs to message send

**Message model** (`conversations/models.py`):
```python
class ConversationMessage(Base):
    id: str       # UUID4
    conversation_id: str  # FK
    role: MessageRole  # user | assistant | system | tool
    content: str  # TEXT
    meta: dict    # JSONB — execution_id, duration_ms, agent_id, etc.
    created_at: datetime
```
- `meta` JSONB is already used for execution metadata
- Adding `attachments` as a separate JSONB column (not inside `meta`) keeps concerns separated and allows independent indexing if needed later

**Send message flow** (`conversations/router.py`):
1. `POST /{conversation_id}/messages` with `SendMessageRequest(content=...)`
2. `conv_service.add_message(conversation_id, role="user", content=...)`
3. Supervisor routing → execution dispatch → SSE stream
4. `_persist_assistant_message()` saves AI response

**API client pattern** (`packages/api-client`):
- `api.post("/conversations/{id}/messages", data)` — JSON body
- For file uploads, need `api.upload(url, formData)` or similar multipart method

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `engine/server/src/conversations/models.py` | ConversationMessage model — add `attachments` column |
| `engine/server/src/conversations/schemas.py` | SendMessageRequest, MessageResponse — add attachment fields |
| `engine/server/src/conversations/router.py` | Message endpoint — validate attachment_ids, attach to message |
| `engine/server/src/conversations/service.py` | `add_message()` — pass attachments through |
| `engine/server/src/infra/object_store.py` | ObjectStore — reuse for attachment upload/download |
| `engine/server/src/rag/router.py` | Reference: existing file upload pattern (UploadFile + streaming) |
| `apps/chat/src/components/ChatInput.tsx` | Existing file UI — wire onFilesChange |
| `apps/chat/src/pages/Chat.tsx` | Chat page — connect upload + send flow |
| `platform/src/components/chat/ChatInput.tsx` | Platform chat input — same changes as apps/chat |
| `platform/src/hooks/useChat.ts` | Platform chat hook — add upload logic |
| `packages/ui/src/components/chat-messages.tsx` | Message rendering — add attachment display |

### Technical Decisions

1. **Separate upload endpoint (not multipart message send)**: Uploading files in the same request as the message (`multipart/form-data` with JSON + files) is fragile and complicates the API. Instead: (a) upload files first → get attachment IDs, (b) send message with attachment IDs in JSON body. This is the pattern used by Slack, Discord, and most modern chat APIs. Benefits: retry uploads independently, show upload progress per file, keep message send fast and atomic.

2. **`attachments` as dedicated JSONB column (not inside `meta`)**: The `meta` field already serves as execution metadata storage (execution_id, duration_ms, agent_id, routing_strategy). Mixing attachment data into it creates coupling. A dedicated `attachments` column is cleaner, queryable, and can be indexed independently. Structure:
   ```json
   [
     {
       "id": "uuid",
       "filename": "report.pdf",
       "content_type": "application/pdf",
       "size_bytes": 1234567,
       "object_key": "chat/conv_id/msg_id/report.pdf"
     }
   ]
   ```

3. **Attachment ID = UUID generated server-side on upload**: The upload endpoint creates a UUID, stores the file in MinIO at `chat/{conversation_id}/{attachment_id}/{filename}`, and returns the ID. The client includes this ID in `SendMessageRequest.attachment_ids`. The server validates that the IDs exist and belong to this conversation before saving the message.

4. **Pending attachments in Redis (not DB)**: Between upload and message send, attachment metadata lives in Redis (`attachment:{id}` with 1h TTL). When the message is sent, metadata is moved from Redis into the message's `attachments` JSONB. This avoids orphan DB records if the user uploads but never sends. Redis TTL auto-cleans abandoned uploads. MinIO files for expired attachments are cleaned by a scheduled job.

5. **Text extraction for LLM context**: When a message has document attachments (PDF, TXT, MD, DOCX), extract text and prepend it to the prompt as context. Reuse `extract_text()` from `rag/processor.py`. For images: skip for now (vision model integration is out of scope). Extracted text is NOT stored — it's computed on-the-fly during execution.

6. **Max 5 files, 25MB each**: Smaller limits than RAG (50MB) because chat attachments are more frequent and the UX should feel instant. 5 files prevents abuse and keeps the message bubble clean.

7. **Image inline preview in message bubbles**: For image attachments (`image/*`), render an `<img>` tag with the serve URL directly. For documents, render a file chip (icon + filename + size). Both link to the download endpoint.

## Implementation Plan

### Tasks

#### Phase 1: Backend — Upload & Serve Endpoints

- [ ] Task 1: Add `attachments` column to ConversationMessage
  - File: `engine/server/src/conversations/models.py`
  - Action: Add to `ConversationMessage`:
    ```python
    attachments: Mapped[list[dict]] = mapped_column(
        JSONB, default=list, server_default="[]",
    )
    ```
  - Notes: JSONB array of attachment metadata objects. Default empty list. No FK — self-contained.

- [ ] Task 2: Create Alembic migration
  - File: `engine/server/alembic/versions/xxxx_add_message_attachments.py` (new)
  - Action: Add `attachments` JSONB column to `conversation_messages` table with `server_default='[]'`
  - Notes: Non-destructive, backward compatible — existing rows get empty array default

- [ ] Task 3: Create attachment upload endpoint
  - File: `engine/server/src/conversations/router.py`
  - Action: Add new endpoint:
    ```python
    @router.post("/{conversation_id}/attachments", status_code=201)
    async def upload_attachment(
        conversation_id: str,
        user: CurrentUser,
        db: DbSession,
        file: UploadFile = File(...),
    ) -> AttachmentResponse:
        """Upload a file attachment for a future message in this conversation."""
    ```
  - Logic:
    1. Verify conversation exists and belongs to user
    2. Validate file extension and size (25MB max)
    3. Generate attachment UUID
    4. Upload to MinIO: `chat/{conversation_id}/{attachment_id}/{filename}`
    5. Store pending metadata in Redis: `attachment:{attachment_id}` with 1h TTL
       ```json
       {
         "id": "uuid",
         "conversation_id": "conv_uuid",
         "user_id": "user_uuid",
         "filename": "report.pdf",
         "content_type": "application/pdf",
         "size_bytes": 1234567,
         "object_key": "chat/conv_id/att_id/report.pdf"
       }
       ```
    6. Return `AttachmentResponse(id, filename, content_type, size_bytes)`
  - Allowed types: PDF, TXT, CSV, MD, JSON, DOCX + PNG, JPG, JPEG, GIF, WEBP
  - Notes: Upload is conversation-scoped. The Redis entry prevents using an attachment ID from another conversation.

- [ ] Task 4: Create attachment serve endpoint
  - File: `engine/server/src/conversations/router.py`
  - Action: Add new endpoint:
    ```python
    @router.get("/attachments/{attachment_id}")
    async def serve_attachment(
        attachment_id: str,
        user: CurrentUser,
        db: DbSession,
    ) -> StreamingResponse:
        """Serve an attachment file (from a sent message)."""
    ```
  - Logic:
    1. Find the message containing this attachment ID (query `conversation_messages` where `attachments @> '[{"id": "..."}]'`)
    2. Verify user owns the conversation
    3. Get `object_key` from attachment metadata
    4. Stream from MinIO
    5. Return `StreamingResponse` with `Content-Type` and `Content-Disposition`
  - Notes: This endpoint only works for attachments that are part of sent messages (not pending uploads). For pending uploads, the frontend shows the local File object preview.

- [ ] Task 5: Update SendMessageRequest and message creation
  - File: `engine/server/src/conversations/schemas.py`
  - Action:
    ```python
    class SendMessageRequest(BaseModel):
        content: str = Field(min_length=1, max_length=50000)
        attachment_ids: list[str] = Field(default=[], max_length=5)

    class AttachmentResponse(BaseModel):
        id: str
        filename: str
        content_type: str | None = None
        size_bytes: int | None = None

    class MessageAttachment(BaseModel):
        id: str
        filename: str
        content_type: str | None = None
        size_bytes: int | None = None
        object_key: str  # S3 key — not exposed to client

    class MessageResponse(BaseModel):
        # ... existing fields ...
        attachments: list[AttachmentResponse] = []
    ```
  - File: `engine/server/src/conversations/router.py`
  - Action: In `send_message()`:
    1. For each `attachment_id` in request, fetch from Redis `attachment:{id}`
    2. Validate: exists, belongs to this conversation, belongs to this user
    3. Build `attachments` list from Redis data
    4. Pass to `conv_service.add_message(..., attachments=attachments_list)`
    5. Delete Redis keys for claimed attachments
  - Notes: If any attachment_id is invalid or expired, return 422 with details

- [ ] Task 6: Update conversation service
  - File: `engine/server/src/conversations/service.py`
  - Action: Update `add_message()` to accept and persist `attachments` parameter:
    ```python
    async def add_message(
        self, conversation_id: str, role: str, content: str,
        meta: dict | None = None,
        attachments: list[dict] | None = None,
    ) -> ConversationMessage:
    ```
  - Pass `attachments=attachments or []` to `ConversationMessage()` constructor

#### Phase 2: LLM Context Integration

- [ ] Task 7: Extract text from document attachments for LLM prompt
  - File: `engine/server/src/prompt_layers/context.py` (or `executions/service.py`)
  - Action: When building the execution prompt, check if the user message has document attachments. For each document attachment:
    1. Download from MinIO via `ObjectStore`
    2. Extract text using `extract_text()` from `rag/processor.py`
    3. Prepend to prompt as context block:
       ```
       [Attached document: report.pdf]
       <document_content>
       ... extracted text (truncated to 10000 chars) ...
       </document_content>
       ```
  - Skip image attachments (no text extraction)
  - Truncate extracted text to `MAX_ATTACHMENT_CONTEXT_CHARS = 10000` per file
  - Notes: This is best-effort. If extraction fails (corrupted PDF, etc.), log warning and skip. The user message content is still sent regardless.

#### Phase 3: Frontend Integration

- [ ] Task 8: Add upload method to API client
  - File: `packages/api-client/src/index.ts` (or `conversations.ts`)
  - Action: Add multipart upload method:
    ```typescript
    async uploadAttachment(
      conversationId: string,
      file: File,
    ): Promise<AttachmentResponse> {
      const formData = new FormData();
      formData.append("file", file);
      return this.client.post(
        `/conversations/${conversationId}/attachments`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
    }
    ```

- [ ] Task 9: Wire ChatInput file upload in Chat app
  - File: `apps/chat/src/pages/Chat.tsx`
  - Action:
    1. Track attached files in state: `const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])`
    2. Track uploaded attachment IDs: `const [attachmentIds, setAttachmentIds] = useState<Map<string, string>>(new Map())` — maps local file ID → server attachment ID
    3. On `onFilesChange`: for each new file, call `api.uploadAttachment(conversationId, file.file)` and store the returned ID
    4. On send: pass `attachment_ids: [...attachmentIds.values()]` in the message request
    5. Clear files and IDs after send
    6. Show upload progress indicator on each file chip
    7. Handle upload errors: show error toast, mark file as failed, allow retry
  - Notes: Uploads happen immediately on file attach (not on send). This gives instant feedback and makes send fast.

- [ ] Task 10: Wire ChatInput in Platform app
  - File: `platform/src/components/chat/ChatInput.tsx`, `platform/src/hooks/useChat.ts`
  - Action: Same logic as Task 9 adapted for the Platform's `useChat` hook pattern
  - Notes: Platform uses `useChat` hook which encapsulates the API calls. Add `uploadAttachment` and `attachmentIds` to the hook.

- [ ] Task 11: Render attachments in message bubbles
  - File: `packages/ui/src/components/chat-messages.tsx`
  - Action: In the message component, render attachments:
    ```tsx
    {message.attachments?.map((att) => (
      <AttachmentChip key={att.id} attachment={att} />
    ))}
    ```
  - `AttachmentChip` component:
    - For images (`image/*`): render inline `<img>` thumbnail (max 300px wide, rounded corners)
    - For documents: render a chip with file icon (based on content_type), filename, and size
    - Both clickable: open in new tab or download
    - URL: `/api/conversations/attachments/{att.id}`
  - Notes: `AttachmentChip` goes in `packages/ui/src/components/attachment-chip.tsx` (new, shared). Add `"use client"` directive.

#### Phase 4: Cleanup & Housekeeping

- [ ] Task 12: Scheduled cleanup of orphaned attachments
  - File: `engine/server/src/worker/scheduler.py`
  - Action: Add APScheduler job (runs every hour):
    ```python
    async def cleanup_orphaned_attachments():
        """Delete MinIO files for attachments that were uploaded but never sent."""
    ```
  - Logic:
    1. List all objects in `chat-attachments` bucket with prefix `chat/`
    2. For each object, check if the attachment ID appears in any message's `attachments` JSONB
    3. If not found and object is older than 2 hours → delete from MinIO
  - Alternative simpler approach: since pending attachments are in Redis with 1h TTL, we could list MinIO objects older than 2h that have no matching message record. But scanning all MinIO objects is expensive. **Better approach**: use MinIO bucket lifecycle rules to auto-expire objects older than 24h in a `pending/` prefix, and move files to the final prefix only when the message is sent.
  - **Revised approach**:
    - Upload stores at: `chat/pending/{attachment_id}/{filename}`
    - On message send: copy to `chat/{conversation_id}/{message_id}/{attachment_id}/{filename}` and delete pending
    - MinIO lifecycle rule: auto-delete `chat/pending/*` older than 24h
    - This eliminates the need for a scheduled cleanup job entirely
  - Notes: The lifecycle rule is set in `ObjectStore.ensure_buckets()` during startup

### Acceptance Criteria

1. **Upload**: `POST /conversations/{id}/attachments` accepts files up to 25MB, stores in MinIO, returns attachment metadata
2. **Send with attachments**: `POST /conversations/{id}/messages` accepts `attachment_ids`, validates them, persists in message `attachments` JSONB
3. **Serve**: `GET /conversations/attachments/{id}` streams the file with correct Content-Type and auth check
4. **UI upload**: Attaching a file in ChatInput triggers immediate upload with progress feedback
5. **UI render**: Message bubbles show attachment chips (images inline, documents as chips)
6. **LLM context**: Document attachments have their text extracted and included in the agent prompt
7. **Validation**: File type and size validation on both frontend and backend
8. **Cleanup**: Orphaned pending uploads are auto-deleted via MinIO lifecycle rules
9. **Both apps**: Works in `apps/chat` and `platform` chat

## Additional Context

### Dependencies

- **Hard dependency**: [MinIO Object Storage spec](tech-spec-minio-object-storage.md) — provides `ObjectStore`, MinIO service, `chat-attachments` bucket
- `python-magic` or similar for content-type sniffing (optional, can rely on browser-provided content-type)
- Alembic migration for `attachments` column

### Testing Strategy

- **Unit tests**: Mock ObjectStore + Redis, test upload/claim/serve flow
- **Frontend**: Vitest + Testing Library for ChatInput file handling
- **Integration**: Upload a file, send a message with it, verify message response includes attachment, verify serve endpoint works
- **Edge cases**: expired attachment ID, wrong conversation, max file count exceeded, unsupported file type

### Notes

- The `ALLOWED_FILE_TYPES` in `ChatInput.tsx` needs to be expanded to include image types (`image/png`, `image/jpeg`, `image/gif`, `image/webp`). Currently it only allows documents.
- The `MAX_FILE_SIZE` in ChatInput should be updated from 100MB to 25MB to match the backend limit
- Image attachments are served as-is (no resizing/thumbnailing). The frontend `<img>` tag handles display sizing via CSS. For bandwidth optimization, thumbnail generation can be added later.
- Assistant messages can also have attachments (future: AI-generated files). The `attachments` column is on `ConversationMessage` not just user messages, so no schema change needed later.
- The attachment serve URL pattern (`/conversations/attachments/{id}`) is deliberately flat (not nested under conversation ID) to keep URLs simple and avoid leaking conversation structure in shared links.
