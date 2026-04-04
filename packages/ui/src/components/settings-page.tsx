"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { AppearanceCard } from "./appearance-card";

export interface SettingsTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface SettingsPageProps {
  extraTabs?: SettingsTab[];
  defaultTab?: string;
}

export function SettingsPage({ extraTabs = [], defaultTab = "appearance" }: SettingsPageProps) {
  const hasTabs = extraTabs.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your preferences</p>
      </div>

      {hasTabs ? (
        <Tabs defaultValue={defaultTab} className="max-w-2xl">
          <TabsList>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            {extraTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="appearance" className="mt-4">
            <AppearanceCard />
          </TabsContent>
          {extraTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="max-w-2xl space-y-6">
          <AppearanceCard />
        </div>
      )}
    </div>
  );
}
