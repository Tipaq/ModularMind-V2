---
name: migrate
description: Create or apply database migrations for engine (Alembic) or platform (Prisma)
argument-hint: "<engine|platform> [message]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep
---

Manage database migrations for engine (Alembic) or platform (Prisma).

## Arguments

- `/migrate engine <message>` — generate a new Alembic migration
- `/migrate engine apply` — apply pending migrations (`alembic upgrade head`)
- `/migrate engine status` — show current migration state
- `/migrate platform` — push Prisma schema to database
- `/migrate platform studio` — open Prisma Studio

## Steps

### Engine (Alembic)

1. **Generate** (`/migrate engine <message>`):
   - First show the current state: `cd engine/server && alembic current`
   - Generate: `cd engine/server && alembic revision --autogenerate -m "<message>"`
   - Read the generated migration file and present it for review
   - Ask for confirmation before applying

2. **Apply** (`/migrate engine apply`):
   - Show pending: `cd engine/server && alembic current`
   - Apply: `cd engine/server && alembic upgrade head`
   - Confirm success

3. **Status** (`/migrate engine status`):
   - `cd engine/server && alembic current`
   - `cd engine/server && alembic history --verbose -3`

### Platform (Prisma)

1. **Push** (`/migrate platform`):
   - `cd platform && npx prisma db push`
   - Show result

2. **Studio** (`/migrate platform studio`):
   - `cd platform && npx prisma studio`

## Rules
- Always show migration content before applying
- Never apply without user confirmation
- Never modify `engine/server/alembic/` directory structure manually
- Never modify `platform/prisma/schema.prisma` without asking
