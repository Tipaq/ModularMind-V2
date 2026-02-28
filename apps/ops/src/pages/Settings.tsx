import { AppearanceCard } from "@modularmind/ui";

export default function Settings() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <AppearanceCard />
      </div>
    </div>
  );
}
