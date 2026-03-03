# Conventions Git & Branching — ModularMind

## Branch Strategy

### Main Branches

| Branch | Purpose | Protection |
|--------|---------|-----------|
| `main` | Production-ready code | 2 reviews, CI must pass, no force push |
| `develop` | Integration branch for next release | 1 review, CI must pass |

### Feature Branches

```
feature/MM-123-add-memory-graph        # Feature with Jira ticket
fix/MM-456-sse-reconnection-loop       # Bug fix with Jira ticket
chore/update-dependencies              # Maintenance without ticket
docs/update-api-reference              # Documentation
refactor/simplify-rag-pipeline         # Refactoring
```

### Naming Rules

- Prefix: `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`
- Include Jira ticket number when applicable: `MM-123`
- Use kebab-case for the description
- Keep it short and descriptive (< 50 characters)

## Commit Messages

We follow **Conventional Commits** format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(rag): add semantic chunking strategy` |
| `fix` | Bug fix | `fix(sse): prevent reconnection loop on 401` |
| `chore` | Maintenance | `chore: update pnpm to v9.5` |
| `docs` | Documentation | `docs(api): update memory search endpoint` |
| `refactor` | Code restructure | `refactor(memory): simplify consolidator logic` |
| `test` | Add/update tests | `test(rag): add processor integration tests` |
| `perf` | Performance | `perf(embedding): batch size optimization` |
| `ci` | CI/CD changes | `ci: add Qdrant service to test matrix` |

### Scopes

Common scopes: `rag`, `memory`, `auth`, `sse`, `ui`, `api-client`, `ops`, `chat`, `platform`, `worker`, `infra`, `docker`

### Examples

```
feat(memory): add memory graph visualization

Implement interactive graph view for memory relationships.
Nodes represent memory entries with color-coded tiers.
Edges show entity overlap, semantic similarity, and shared tags.

Closes MM-234

---

fix(rag): prevent duplicate chunks on document reprocessing

When a document was reprocessed (e.g., after collection settings change),
chunks were duplicated instead of replaced. Now we delete existing chunks
before reprocessing.

Fixes MM-345
```

## Pull Request Process

### PR Title

Follow the same format as commit messages:
```
feat(rag): add semantic chunking strategy
```

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- List of changes

## Testing
- How to test these changes

## Screenshots (if UI changes)

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No hardcoded colors (semantic tokens only)
- [ ] Type-safe (no `any` types)
```

### Review Expectations

| PR Size | Review Time | Reviewers |
|---------|------------|-----------|
| Small (< 100 lines) | Same day | 1 reviewer |
| Medium (100-500 lines) | 1-2 days | 1-2 reviewers |
| Large (> 500 lines) | 2-3 days | 2 reviewers |

**Tip:** Keep PRs small. If a feature is large, split it into multiple PRs.

### Merge Strategy

- **Squash merge** to `develop` and `main` (clean history)
- Delete the branch after merge
- Never force push to `main` or `develop`