---
name: review
description: Review code changes for quality, security, and convention compliance
argument-hint: "[PR-number|branch]"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Agent
context: fork
agent: Explore
---

Perform a thorough code review on the current diff or a specific PR.

## Arguments

- `/review` — review uncommitted changes (`git diff`)
- `/review staged` — review staged changes only
- `/review 123` — review GitHub PR #123
- `/review branch-name` — review diff between branch and main

## Steps

1. **Get the diff**:
   - No args: `git diff` + `git diff --staged`
   - PR number: `gh pr diff $ARGUMENTS`
   - Branch: `git diff main...$ARGUMENTS`

2. **Analyze each changed file** for:

   ### Security (Critical)
   - SQL injection, XSS, command injection
   - Hardcoded secrets, API keys, tokens
   - Unsafe deserialization
   - Missing auth checks on endpoints

   ### Code Quality
   - Functions > 30 lines
   - Files > 300 lines
   - Magic numbers (should be constants)
   - DRY violations (duplicated logic)
   - Missing type annotations (Python/TypeScript)

   ### Project Conventions (from CLAUDE.md)
   - No hardcoded Tailwind colors (must use semantic tokens)
   - Python imports: `from src.xxx` not relative
   - `"use client"` on UI components with hooks
   - Model IDs in `provider:model` format
   - UI primitives from `@modularmind/ui` only

   ### Performance
   - N+1 queries
   - Missing indexes on queried columns
   - Unnecessary re-renders (React)
   - Large payloads without pagination

3. **Present findings** grouped by severity:
   - **CRITICAL** — must fix before merge (security, data loss)
   - **WARNING** — should fix (quality, conventions)
   - **INFO** — suggestions for improvement

4. For each finding, include:
   - File and line reference
   - What the issue is
   - Suggested fix (code snippet if possible)
