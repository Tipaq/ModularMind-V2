#!/bin/bash
# PreToolUse hook: block edits to critical files listed in CLAUDE.md
# Exit 2 = block the action, stderr becomes feedback to Claude

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

PROTECTED_PATTERNS=(
  "engine/server/src/infra/database.py"
  "engine/server/src/infra/redis.py"
  "engine/server/src/infra/secrets.py"
  "engine/server/src/infra/sse.py"
  "engine/server/src/infra/config.py"
  "engine/server/src/infra/publish.py"
  "engine/server/entrypoint.sh"
  "gateway/src/permission_engine.py"
  "gateway/src/sandbox/"
  "platform/prisma/schema.prisma"
  "packages/ui/src/styles/theme.css"
  "engine/server/alembic/env.py"
  ".env"
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "BLOCKED: '$FILE_PATH' is a protected file (matches '$pattern'). Ask the user for explicit permission before modifying." >&2
    exit 2
  fi
done

exit 0
