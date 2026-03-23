# ADR-004: Monorepo Strategy with pnpm Workspaces + Turborepo

## Status

**Accepted** — 2025-08-10

## Context

ModularMind has three frontend applications (Chat, Ops, Platform) and two shared packages (UI components, API client). We need a repository and build strategy that enables code sharing, consistent dependency versions, and fast builds.

## Decision

**We chose a pnpm workspaces monorepo with Turborepo for build orchestration.**

### Monorepo Structure

```
ModularMind-V2/
├── pnpm-workspace.yaml
├── turbo.json
├── apps/
│   ├── chat/           # Vite + React (port 5173)
│   ├── ops/            # Vite + React (port 5174)
│   └── (platform is separate — Next.js at root /platform)
├── packages/
│   ├── ui/             # @modularmind/ui — shadcn/ui components
│   └── api-client/     # @modularmind/api-client — typed HTTP client
```

### Why pnpm over npm/yarn

| Feature | npm | yarn | pnpm |
|---------|-----|------|------|
| Disk usage | High (flat node_modules) | Medium (PnP or hoisted) | Low (content-addressed store) |
| Install speed | Slow | Medium | Fast |
| Strict dependency resolution | No | Optional | Yes (by default) |
| Workspace protocol | Basic | Good | Excellent |
| Phantom dependencies | Common | Possible | Prevented |

pnpm's strict mode prevents phantom dependencies — packages can only import what they explicitly declare in their `package.json`. This catches dependency issues early.

### Why Turborepo over Nx

| Feature | Turborepo | Nx |
|---------|-----------|-----|
| Configuration | Minimal (turbo.json) | Extensive (nx.json + project.json per package) |
| Learning curve | Low | High |
| Cache | Local + Remote (Vercel) | Local + Remote (Nx Cloud) |
| Task orchestration | Pipeline-based | Graph-based |
| Community | Growing | Established |

Turborepo's simplicity won: a single `turbo.json` configures the entire build pipeline. Nx's power is overkill for our 5-package monorepo.

### Build Pipeline (turbo.json)

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Shared Package Configuration

**@modularmind/ui** — All shared React components:
- Built with tsup (ESM + CJS output)
- Components follow shadcn/ui patterns
- All components with hooks include `"use client"` directive for Next.js
- Theme system (ThemeProvider, CSS tokens) consumed by all apps
- Published via workspace protocol: `"@modularmind/ui": "workspace:*"`

**@modularmind/api-client** — Typed HTTP client:
- Axios-based with automatic cookie auth
- Session expiry event emitter
- Full TypeScript types for all API endpoints
- Shared between Chat, Ops, and Platform apps

## Consequences

### Positive
- Shared components are always in sync across all apps
- Single `pnpm install` sets up the entire project
- `turbo run build` caches intermediate results (80%+ cache hit rate)
- Type changes in shared packages immediately surface in consuming apps
- Code review is simplified — all changes in one PR

### Negative
- CI builds must checkout the entire repo (mitigated by Turborepo's affected filter)
- Git history is larger (all apps in one repo)
- Must be careful with package boundaries (avoid circular dependencies)
