#!/bin/bash
# Seed the GitHub Issue Resolver graph and agents
# Usage: ./seeds/seed.sh <engine_url> <cookie_file>
# Example: ./seeds/seed.sh http://localhost:8000 /tmp/mm_cookies.txt

set -e

ENGINE_URL="${1:-http://localhost:8000}"
COOKIE_FILE="${2:-/tmp/mm_cookies.txt}"
API="$ENGINE_URL/api/v1"
SEED_FILE="$(dirname "$0")/github_issue_resolver.json"

if [ ! -f "$COOKIE_FILE" ]; then
  echo "Error: cookie file not found. Login first."
  exit 1
fi

echo "Seeding from $SEED_FILE..."

# Create agents and collect IDs
declare -A AGENT_IDS

for row in $(node -e "
  const d=JSON.parse(require('fs').readFileSync('$SEED_FILE','utf8'));
  d.agents.forEach(a => console.log(a.node_id + '|' + JSON.stringify({
    name: a.name, description: a.description, model_id: a.model_id,
    system_prompt: a.system_prompt, tool_categories: a.tool_categories
  })));
"); do
  NODE_ID=$(echo "$row" | cut -d'|' -f1)
  BODY=$(echo "$row" | cut -d'|' -f2-)

  RESULT=$(curl -s -b "$COOKIE_FILE" -X POST "$API/agents" \
    -H 'Content-Type: application/json' -d "$BODY")
  AGENT_ID=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.id)" 2>/dev/null)

  echo "  Agent: $NODE_ID -> $AGENT_ID"
  AGENT_IDS[$NODE_ID]=$AGENT_ID
done

# Build graph payload with agent IDs injected
GRAPH_PAYLOAD=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$SEED_FILE','utf8'));
  const ids = JSON.parse(process.argv[1]);
  for (const node of d.graph.nodes) {
    if (ids[node.id]) {
      node.data.agent_id = ids[node.id];
    }
  }
  console.log(JSON.stringify(d.graph));
" "{$(for k in "${!AGENT_IDS[@]}"; do echo "\"$k\":\"${AGENT_IDS[$k]}\","; done | sed 's/,$//')}")

RESULT=$(curl -s -b "$COOKIE_FILE" -X POST "$API/graphs" \
  -H 'Content-Type: application/json' -d "$GRAPH_PAYLOAD")
GRAPH_ID=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.id)" 2>/dev/null)

echo "  Graph: GitHub Issue Resolver -> $GRAPH_ID"
echo "Done!"
