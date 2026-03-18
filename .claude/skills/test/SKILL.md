---
name: test
description: Run tests intelligently based on changed files or a specific scope
argument-hint: "[backend|frontend|all|file]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
---

Run tests smartly based on what changed or the specified scope.

## Arguments

- `/test` — auto-detect changed files and run relevant tests
- `/test backend` — run Python tests only (`pytest`)
- `/test frontend` — run TypeScript tests only (`pnpm test`)
- `/test all` — run everything
- `/test path/to/file` — run tests for a specific file

## Steps

1. Parse `$ARGUMENTS` to determine scope

2. **If no argument (auto-detect)**:
   - Run `git diff --name-only HEAD` to find changed files
   - If Python files changed (`engine/`, `gateway/`, `shared/`): run backend tests
   - If TS/TSX files changed (`apps/`, `packages/`, `platform/`): run frontend tests
   - If both: run both

3. **Backend tests**:
   ```bash
   cd engine/server && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
   ```
   - For a specific file: `python -m pytest tests/ -v -k "test_name" --tb=short`

4. **Frontend tests**:
   ```bash
   pnpm test 2>&1 | tail -30
   ```
   - For a specific package: `pnpm --filter @modularmind/ui test`

5. **Present results** as a clear summary:
   - Total tests run / passed / failed / skipped
   - List any failures with file:line and error message
   - If all pass: confirm with a short message

## Rules
- Always show the tail of test output, not the full log
- If tests fail, suggest fixes but don't auto-fix without asking
- Use `--tb=short` for pytest to keep output concise
