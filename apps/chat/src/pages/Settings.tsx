import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SettingsPage } from "@modularmind/ui";
import type { SettingsTab } from "@modularmind/ui";
import { Secrets } from "./Secrets";
import { MyConnections } from "./MyConnections";

export default function Settings() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "appearance";

  const extraTabs: SettingsTab[] = useMemo(() => [
    { id: "connections", label: "Connections", content: <MyConnections /> },
    { id: "secrets", label: "Secrets", content: <Secrets /> },
  ], []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl p-6">
        <SettingsPage extraTabs={extraTabs} defaultTab={defaultTab} />
      </div>
    </div>
  );
}
