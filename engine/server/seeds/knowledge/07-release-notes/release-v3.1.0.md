# ModularMind v3.1.0 — Release Notes

**Release Date:** 2025-12-01
**Type:** Minor Release

## Highlights

Multi-collection RAG search, RBAC group-based access control, and comprehensive theme customization system.

## New Features

### RAG Multi-Collection Search
- Search across multiple collections in a single query
- Automatic scope-based filtering (GLOBAL, GROUP, AGENT)
- Results include collection and document source information
- Configurable per-collection weights (coming in v3.2)

### RBAC Group-Based Access Control
- Users can now belong to multiple groups (engineering, devops, support, etc.)
- RAG collections can be scoped to specific groups via `allowed_groups`
- Group membership synced from Platform via ConfigProvider
- Admin API for managing user groups

### Theme Customization System
- Complete theme overhaul with HSL-based CSS variables
- ThemeProvider context for React apps (mode, accent color, presets)
- Anti-FOUC inline script for instant theme application
- 6 color presets + custom hue/saturation picker
- Persisted to localStorage across sessions

### Active Instances Tab (Ops)
- Real-time view of connected Engine instances
- Health status, uptime, version, and last sync timestamp
- Ability to trigger config refresh from Ops console

## Improvements

- Document processing now supports `.doc` format (legacy Word)
- Token-aware chunking strategy added as alternative to character-based
- Memory fact extractor prompt improved for better entity recognition
- API response times reduced by 20% with query optimization
- Ops console fully migrated to shared @modularmind/ui components

## Bug Fixes

- Fixed memory leak in SSE connection handler (connections not properly closed)
- Fixed RAG document count not updating after deletion
- Fixed theme not persisting in Firefox private browsing mode
- Fixed worker crash when Qdrant is temporarily unavailable

## Deprecations

- Character-based chunking (`TextChunker`) is deprecated in favor of `token_aware`
- `GET /rag/search` endpoint deprecated, use `POST /rag/search` instead