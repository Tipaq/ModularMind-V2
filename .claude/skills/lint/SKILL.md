---
name: lint
description: Run linters and optionally auto-fix issues
argument-hint: "[fix|backend|frontend]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
---

Run linters across the project and optionally auto-fix.

## Arguments

- `/lint` — run all linters (report only)
- `/lint fix` — run all linters with auto-fix
- `/lint backend` — Python only (ruff)
- `/lint frontend` — TypeScript only (eslint)
- `/lint backend fix` or `/lint fix backend` — Python auto-fix

## Steps

1. Parse `$ARGUMENTS` for scope and fix mode

2. **Python (ruff)**:
   - Report: `ruff check engine/server/src gateway/src shared/src 2>&1 | tail -20`
   - Fix: `ruff check --fix engine/server/src gateway/src shared/src && ruff format engine/server/src gateway/src shared/src`

3. **TypeScript (eslint via turbo)**:
   - Report: `pnpm lint 2>&1 | tail -30`
   - Fix: `pnpm lint -- --fix 2>&1 | tail -30`

4. **Present results**:
   - Count of errors/warnings per category
   - List remaining issues after fix (if any)
   - If clean: confirm with a short message

## Rules
- Never install new packages
- Use existing ruff and eslint configs
- Show concise output (tail, not full logs)
