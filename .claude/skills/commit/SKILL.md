---
name: commit
description: Create a conventional commit from staged or unstaged changes
argument-hint: "[scope]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
---

Create a conventional commit following project conventions.

## Steps

1. Run `git status` to see current state (never use `-uall` flag)
2. Run `git diff --staged` to check staged changes. If nothing is staged, run `git diff` to see unstaged changes and ask the user what to stage
3. Run `git log --oneline -5` to match the commit message style of the repo
4. Analyze the changes and determine the commit type:
   - `feat` — new feature
   - `fix` — bug fix
   - `refactor` — restructuring without behavior change
   - `chore` — tooling, config, deps
   - `docs` — documentation only
   - `test` — adding/updating tests
   - `style` — formatting, whitespace
   - `perf` — performance improvement
5. If `$ARGUMENTS` is provided, use it as the scope (e.g., `feat(engine): ...`)
6. Draft a concise commit message (1-2 sentences) focused on the "why" not the "what"
7. Present the message to the user for confirmation before committing
8. Stage the relevant files (prefer specific files over `git add .`)
9. Create the commit using a HEREDOC format:
```bash
git commit -m "$(cat <<'EOF'
type(scope): message

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
10. Set the author: `Tim North <tim@modularmind.dev>`

## Rules
- Never force-push
- Never use `--no-verify`
- Never amend unless explicitly asked
- Never commit `.env` files or credentials
- Keep commits small and atomic
- If pre-commit hook fails, fix the issue and create a NEW commit
