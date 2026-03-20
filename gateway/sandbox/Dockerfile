# =============================================================================
# Gateway Sandbox — isolated execution environment for agents
# =============================================================================

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates coreutils git curl wget jq dnsutils net-tools \
    && rm -rf /var/lib/apt/lists/*

# CRITICAL: UID 1000 matches workspace chown in SandboxManager
RUN useradd -u 1000 -m -s /bin/bash sandbox

USER sandbox
WORKDIR /workspace

CMD ["sleep", "infinity"]
