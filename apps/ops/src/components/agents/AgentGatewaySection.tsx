import { useState } from "react";
import { Shield, Terminal, Globe } from "lucide-react";
import { SectionCard, ToggleRow } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface GatewayPerms {
  shell?: { enabled?: boolean; require_approval?: boolean };
  browser?: { enabled?: boolean; require_approval?: boolean };
}

function parsePerms(agent: AgentDetail): GatewayPerms {
  const raw = (agent.gateway_permissions ?? {}) as GatewayPerms;
  return {
    shell: { enabled: raw.shell?.enabled ?? false, require_approval: raw.shell?.require_approval ?? true },
    browser: { enabled: raw.browser?.enabled ?? false, require_approval: raw.browser?.require_approval ?? true },
  };
}

interface AgentGatewaySectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

function AgentGatewaySectionInner({ agent, isEditing, onChange }: AgentGatewaySectionProps) {
  const [perms, setPerms] = useState<GatewayPerms>(parsePerms(agent));

  const currentPerms = isEditing ? perms : parsePerms(agent);
  const shellEnabled = currentPerms.shell?.enabled ?? false;
  const browserEnabled = currentPerms.browser?.enabled ?? false;
  const hasGatewayTools = shellEnabled || browserEnabled;

  const updatePerms = (next: GatewayPerms) => {
    setPerms(next);
    const merged = { ...(agent.gateway_permissions as Record<string, unknown> ?? {}), ...next };
    onChange({ gateway_permissions: merged });
  };

  const toggleShellApproval = (checked: boolean) => {
    updatePerms({
      ...perms,
      shell: { ...perms.shell, require_approval: checked },
    });
  };

  const toggleBrowserApproval = (checked: boolean) => {
    updatePerms({
      ...perms,
      browser: { ...perms.browser, require_approval: checked },
    });
  };

  if (!hasGatewayTools) return null;

  return (
    <SectionCard icon={Shield} title="Gateway Permissions" variant="card">
      <div className="space-y-1">
        {shellEnabled && (
          <ToggleRow
            icon={Terminal}
            label="Shell — Require approval"
            checked={currentPerms.shell?.require_approval ?? true}
            onCheckedChange={toggleShellApproval}
            disabled={!isEditing}
          />
        )}
        {browserEnabled && (
          <ToggleRow
            icon={Globe}
            label="Browser — Require approval"
            checked={currentPerms.browser?.require_approval ?? true}
            onCheckedChange={toggleBrowserApproval}
            disabled={!isEditing}
          />
        )}
      </div>
    </SectionCard>
  );
}

export function AgentGatewaySection(props: AgentGatewaySectionProps) {
  const resetKey = props.isEditing ? "editing" : `view-${props.agent.id}`;
  return <AgentGatewaySectionInner key={resetKey} {...props} />;
}
