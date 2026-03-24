"use client";

import { ArrowRight, Check } from "lucide-react";
import { type Step, EMBEDDING_MODELS, BTN_PRIMARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface CompleteStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  email: string;
  runtimeName: string;
  configuredProviderCount: number;
  selectedModelsCount: number;
  embeddingModel: string;
  ollamaEnabled?: boolean;
}

export function CompleteStep({
  step,
  stepIndex,
  error,
  email,
  runtimeName,
  configuredProviderCount,
  selectedModelsCount,
  embeddingModel,
  ollamaEnabled,
}: CompleteStepProps) {
  const embeddingModelName = EMBEDDING_MODELS.find((model) => model.id === embeddingModel)?.name;

  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error}>
      <div className="space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
          <Check className="h-8 w-8 text-success" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold">You're all set!</h2>
          <p className="text-sm text-muted-foreground">
            Your ModularMind instance is configured and ready to use.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Admin</span>
            <span className="font-medium">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Instance</span>
            <span className="font-medium">{runtimeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ollama</span>
            <span className="font-medium">{ollamaEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          {configuredProviderCount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cloud providers</span>
              <span className="font-medium">{configuredProviderCount} configured</span>
            </div>
          )}
          {selectedModelsCount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ollama models</span>
              <span className="font-medium">
                {selectedModelsCount} pulling in background
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Embedding</span>
            <span className="font-medium">{embeddingModelName}</span>
          </div>
        </div>

        {selectedModelsCount > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Model downloads continue in the background. Check progress in the Models page.
          </p>
        )}

        <button
          onClick={() => { window.location.href = "/ops/"; }}
          className={`${BTN_PRIMARY} w-full`}
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </SetupLayout>
  );
}
