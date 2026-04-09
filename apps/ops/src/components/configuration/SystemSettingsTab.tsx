import { Server, Cog, FolderLock } from "lucide-react";
import { Separator } from "@modularmind/ui";
import { InfrastructureTab } from "./InfrastructureTab";
import { SystemTab } from "./SystemTab";
import { FilesystemSecurityTab } from "./FilesystemSecurityTab";

export function SystemSettingsTab() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Server className="h-5 w-5" />
          Infrastructure
        </h2>
        <InfrastructureTab />
      </section>

      <Separator />

      <section>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Cog className="h-5 w-5" />
          System Settings
        </h2>
        <SystemTab />
      </section>

      <Separator />

      <section>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <FolderLock className="h-5 w-5" />
          Filesystem Security
        </h2>
        <FilesystemSecurityTab />
      </section>
    </div>
  );
}
