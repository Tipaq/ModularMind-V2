"use client";

import {
  Plug, Plus, RefreshCw, Eye, EyeOff,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import {
  Button, Card, CardContent, Input, Label,
} from "@modularmind/ui";
import type { ConnectorTypeFormProps } from "./types";

export function ConnectorTypeForm({
  connectorTypes,
  expandedType,
  formData,
  connectorName,
  creating,
  visibleSecrets,
  typeError,
  hasOAuthProviders,
  onToggleExpand,
  onUpdateField,
  onUpdateName,
  onToggleSecretVisibility,
  onConnect,
  onClearError,
}: ConnectorTypeFormProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        {hasOAuthProviders ? "Or connect manually" : "Available services"}
      </p>
      {connectorTypes.map((typeDef) => {
        const isExpanded = expandedType === typeDef.type_id;

        return (
          <Card key={typeDef.type_id}>
            <button
              className="w-full text-left"
              onClick={() => onToggleExpand(typeDef.type_id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Plug className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{typeDef.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeDef.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeDef.doc_url && (
                      <a
                        href={typeDef.doc_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardContent>
            </button>

            {isExpanded && (
              <ConnectorTypeFields
                typeDef={typeDef}
                formData={formData}
                connectorName={connectorName}
                creating={creating}
                visibleSecrets={visibleSecrets}
                typeError={typeError}
                onUpdateField={onUpdateField}
                onUpdateName={onUpdateName}
                onToggleSecretVisibility={onToggleSecretVisibility}
                onConnect={onConnect}
                onClearError={onClearError}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}

import type { ConnectorTypeDef } from "@modularmind/api-client";

interface ConnectorTypeFieldsProps {
  typeDef: ConnectorTypeDef;
  formData: Record<string, Record<string, string>>;
  connectorName: Record<string, string>;
  creating: string | null;
  visibleSecrets: Set<string>;
  typeError: Record<string, string>;
  onUpdateField: (typeId: string, key: string, value: string) => void;
  onUpdateName: (typeId: string, name: string) => void;
  onToggleSecretVisibility: (secretKey: string) => void;
  onConnect: (typeDef: ConnectorTypeDef) => void;
  onClearError: (typeId: string) => void;
}

function ConnectorTypeFields({
  typeDef,
  formData,
  connectorName,
  creating,
  visibleSecrets,
  typeError,
  onUpdateField,
  onUpdateName,
  onToggleSecretVisibility,
  onConnect,
  onClearError,
}: ConnectorTypeFieldsProps) {
  return (
    <div className="border-t px-4 pb-4 pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {typeDef.fields.map((field) => {
          const secretKey = `${typeDef.type_id}-${field.key}`;
          const isPassword = field.is_secret;
          const isVisible = visibleSecrets.has(secretKey);

          return (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs">
                {field.label}
                {field.is_required && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  type={isPassword && !isVisible ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={formData[typeDef.type_id]?.[field.key] || ""}
                  onChange={(e) =>
                    onUpdateField(typeDef.type_id, field.key, e.target.value)
                  }
                  className="text-xs h-8 pr-8"
                />
                {isPassword && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => onToggleSecretVisibility(secretKey)}
                  >
                    {isVisible ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {typeError[typeDef.type_id] && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {typeError[typeDef.type_id]}
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Connection Name</Label>
          <Input
            placeholder={`My ${typeDef.name}`}
            value={connectorName[typeDef.type_id] || ""}
            onChange={(e) => onUpdateName(typeDef.type_id, e.target.value)}
            className="text-xs h-8"
          />
        </div>
        <Button
          onClick={() => {
            onClearError(typeDef.type_id);
            onConnect(typeDef);
          }}
          disabled={creating === typeDef.type_id}
          className="h-8 text-xs"
        >
          {creating === typeDef.type_id ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              Testing...
            </>
          ) : (
            <>
              <Plus className="h-3 w-3 mr-1" />
              Connect
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
