import { InfrastructureTab } from "./InfrastructureTab";
import { SystemTab } from "./SystemTab";
import { FilesystemSecurityTab } from "./FilesystemSecurityTab";

export function SystemSettingsTab() {
  return (
    <div className="space-y-6">
      <InfrastructureTab />
      <SystemTab />
      <FilesystemSecurityTab />
    </div>
  );
}
