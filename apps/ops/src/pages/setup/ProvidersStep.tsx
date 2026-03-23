"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { type Step, CLOUD_PROVIDERS, INPUT_CLASS, BTN_PRIMARY, BTN_SECONDARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface ProvidersStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  apiKeys: Record<string, string>;
  savedKeys: Record<string, boolean>;
  savingKey: string | null;
  visibleKeys: Record<string, boolean>;
  expandedProvider: string | null;
  onApiKeyChange: (providerId: string, value: string) => void;
  onToggleVisibility: (providerId: string) => void;
  onExpandProvider: (providerId: string | null) => void;
  onSaveKey: (providerId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ProvidersStep({
  step,
  stepIndex,
  error,
  apiKeys,
  savedKeys,
  savingKey,
  visibleKeys,
  expandedProvider,
  onApiKeyChange,
  onToggleVisibility,
  onExpandProvider,
  onSaveKey,
  onBack,
  onNext,
}: ProvidersStepProps) {
  const configuredProviderCount = Object.keys(savedKeys).length;

  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error} wide>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Add API keys for cloud LLM providers. Ollama is included for local models.
          </p>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Ollama</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Included
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Local models — no API key needed
              </p>
            </div>
            <Check className="h-5 w-5 text-success" />
          </div>
        </div>

        <div className="space-y-2">
          {CLOUD_PROVIDERS.map((provider) => {
            const isExpanded = expandedProvider === provider.id;
            const isSaved = savedKeys[provider.id];
            const key = apiKeys[provider.id] || "";
            const isVisible = visibleKeys[provider.id];

            return (
              <div
                key={provider.id}
                className="rounded-lg border border-border overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onExpandProvider(isExpanded ? null : provider.id)}
                  className="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${provider.color}/10`}
                  >
                    <Cloud className={`h-4 w-4 ${provider.color.replace("bg-", "text-")}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-medium">{provider.name}</span>
                    <p className="text-xs text-muted-foreground">{provider.models}</p>
                  </div>
                  {isSaved && <Check className="h-4 w-4 text-success" />}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-3 pb-3 pt-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={isVisible ? "text" : "password"}
                          value={key}
                          onChange={(e) => onApiKeyChange(provider.id, e.target.value)}
                          className={`${INPUT_CLASS} pr-10`}
                          placeholder={provider.placeholder}
                        />
                        <button
                          type="button"
                          onClick={() => onToggleVisibility(provider.id)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {isVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={() => onSaveKey(provider.id)}
                        disabled={!key.trim() || savingKey === provider.id}
                        className={`${BTN_PRIMARY} px-4`}
                      >
                        {savingKey === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isSaved ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onBack} className={`${BTN_SECONDARY} flex-1`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button onClick={onNext} className={`${BTN_PRIMARY} flex-1`}>
            {configuredProviderCount > 0 ? "Next" : "Skip for now"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
