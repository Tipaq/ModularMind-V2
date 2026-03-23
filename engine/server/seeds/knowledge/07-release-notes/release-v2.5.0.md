# ModularMind v2.5.0 — Release Notes

**Release Date:** 2025-06-01
**Type:** Minor Release (Legacy v2 Branch)

## Highlights

Last feature release on the v2 branch. Introduces SSE streaming prototype, basic conversation memory, and initial Qdrant integration as a preview of the v3 architecture.

## New Features

### SSE Streaming (Experimental)
- Server-Sent Events endpoint for real-time LLM response streaming
- Replaces polling-based response checking
- Available as opt-in feature via `ENABLE_SSE=true` environment variable
- Note: This is a preview of the v3 streaming architecture

### Conversation Memory (Basic)
- Agents can now remember facts from previous conversations
- Simple keyword extraction (not LLM-based, unlike v3)
- Memory stored in PostgreSQL (no vector search yet)
- Per-user memory isolation

### Qdrant Integration (Preview)
- Optional Qdrant backend for document search
- Replaces FAISS for new deployments
- Migration tool from FAISS index to Qdrant collection
- Note: Full hybrid search available in v3

## Improvements

- Ollama provider now supports concurrent requests (4 parallel by default)
- Document upload limit increased from 10MB to 25MB
- Admin dashboard shows token usage per agent
- API response format standardized with error codes
- Docker Compose updated for Apple Silicon compatibility

## Bug Fixes

- Fixed agent prompt not being sent for the first message
- Fixed WebSocket disconnection not cleaning up server resources
- Fixed PDF extraction failing on scanned documents
- Fixed rate limiter not resetting after window expiration

## End of Life Notice

**ModularMind v2.x will reach end of life on 2025-12-31.** No further updates will be released for the v2 branch. All users should migrate to v3.0+ before this date. See the v3.0.0 migration guide for instructions.