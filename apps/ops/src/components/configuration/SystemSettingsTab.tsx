import { InfrastructureTab } from "./InfrastructureTab";
import { SystemTab } from "./SystemTab";
import { FilesystemSecurityTab } from "./FilesystemSecurityTab";

export function SystemSettingsTab() {
  return (
    <div className="space-y-4">
      <InfrastructureTab />
      <SystemTab />
      <FilesystemSecurityTab />
    </div>
  );
}
