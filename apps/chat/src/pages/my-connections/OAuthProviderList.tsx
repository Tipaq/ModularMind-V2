"use client";

import { LogIn } from "lucide-react";
import { Button, Card, CardContent } from "@modularmind/ui";
import type { OAuthProviderListProps } from "./types";

export function OAuthProviderList({
  providers,
  typeError,
  onConnect,
}: OAuthProviderListProps) {
  if (providers.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        Connect with one click
      </p>
      <div className="grid grid-cols-2 gap-3">
        {providers.map((provider) => (
          <Card key={provider.provider_id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">{provider.name}</p>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onConnect(provider.provider_id)}
                >
                  Connect
                </Button>
              </div>
              {typeError[`oauth_${provider.provider_id}`] && (
                <div className="mt-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {typeError[`oauth_${provider.provider_id}`]}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
