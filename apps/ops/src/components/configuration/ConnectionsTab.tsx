import { Github } from "lucide-react";
import { Separator } from "@modularmind/ui";
import { OAuthProvidersTab } from "./OAuthProvidersTab";
import { GitHubTokensTab } from "./GitHubTokensTab";

export function ConnectionsTab() {
  return (
    <div className="space-y-8">
      <section>
        <OAuthProvidersTab />
      </section>

      <Separator />

      <section>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Github className="h-5 w-5" />
          GitHub Tokens
        </h2>
        <GitHubTokensTab />
      </section>
    </div>
  );
}
