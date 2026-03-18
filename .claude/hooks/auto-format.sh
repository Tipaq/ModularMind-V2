#!/bin/bash
# PostToolUse hook: auto-format files after Edit/Write
# Reads tool input from stdin (JSON with tool_input.file_path)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

EXT="${FILE_PATH##*.}"

case "$EXT" in
  py)
    ruff format "$FILE_PATH" 2>/dev/null
    ruff check --fix --quiet "$FILE_PATH" 2>/dev/null
    ;;
  ts|tsx|js|jsx|json|css)
    npx prettier --write "$FILE_PATH" 2>/dev/null
    ;;
esac

exit 0
