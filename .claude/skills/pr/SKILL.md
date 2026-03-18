---
name: pr
description: Create a GitHub pull request from the current branch
argument-hint: "[base-branch]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
---

Create a GitHub pull request for the current branch.

## Steps

1. Determine the base branch: use `$ARGUMENTS` if provided, otherwise `main`
2. Run these commands in parallel to understand the full state:
   - `git status` (no `-uall`)
   - `git diff` (staged + unstaged)
   - `git log --oneline $(base)..HEAD` to see all commits on this branch
   - `git diff $(base)...HEAD` to see the full diff from base
   - Check if the branch tracks a remote: `git rev-parse --abbrev-ref @{u}`
3. If there are uncommitted changes, warn the user and ask if they want to commit first
4. Analyze ALL commits (not just the latest) to understand the full scope of changes
5. Draft:
   - **Title**: short, under 70 characters, descriptive
   - **Body**: summary bullets + test plan
6. Push the branch if needed: `git push -u origin $(branch)`
7. Create the PR using `gh pr create`:

```bash
gh pr create --title "the title" --body "$(cat <<'EOF'
## Summary
- bullet 1
- bullet 2

## Test plan
- [ ] test step 1
- [ ] test step 2

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

8. Return the PR URL to the user

## Rules
- Never force-push
- Never push to main/master directly
- If the branch has no commits beyond base, abort and tell the user
