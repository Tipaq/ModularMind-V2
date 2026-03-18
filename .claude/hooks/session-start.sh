#!/bin/bash
# SessionStart hook: show workspace status on session start

echo "=== ModularMind V2 — Session Context ==="
echo ""

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
echo "Branch: $BRANCH"

CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$CHANGES" -gt 0 ]; then
  echo "Uncommitted changes: $CHANGES files"
else
  echo "Working tree: clean"
fi

DOCKER_RUNNING=$(docker compose -f docker/docker-compose.dev.yml ps --status running -q 2>/dev/null | wc -l)
echo "Docker services running: $DOCKER_RUNNING"

echo ""
exit 0
