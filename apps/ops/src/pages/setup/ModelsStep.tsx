"use client";

import { ArrowLeft, ArrowRight, Check, Download, Loader2 } from "lucide-react";
import { type Step, OLLAMA_MODELS, BTN_PRIMARY, BTN_SECONDARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface ModelsStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  selectedModels: Set<string>;
  pullingModels: Set<string>;
  loading: boolean;
  onToggleModel: (modelId: string) => void;
  onBack: () => void;
  onPullModels: () => void;
  onSkip: () => void;
}

export function ModelsStep({
  step,
  stepIndex,
  error,
  selectedModels,
  pullingModels,
  loading,
  onToggleModel,
  onBack,
  onPullModels,
  onSkip,
}: ModelsStepProps) {
  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error} wide>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Select Ollama models to download. They'll be pulled in the background.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {OLLAMA_MODELS.map((model) => {
            const Icon = model.icon;
            const isSelected = selectedModels.has(model.id);
            const isPulling = pullingModels.has(model.id);

            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onToggleModel(model.id)}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors text-left ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    isSelected ? "bg-primary/10" : "bg-muted"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isSelected ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    {model.recommended && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{model.category}</span>
                    <span>·</span>
                    <span>{model.size}</span>
                  </div>
                </div>
                {isPulling ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : isSelected ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Download className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>

        {selectedModels.size > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {selectedModels.size} model{selectedModels.size > 1 ? "s" : ""} selected
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onBack} className={`${BTN_SECONDARY} flex-1`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={selectedModels.size > 0 ? onPullModels : onSkip}
            disabled={loading}
            className={`${BTN_PRIMARY} flex-1`}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : selectedModels.size > 0 ? (
              <>
                Pull & Continue
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Skip for now
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
