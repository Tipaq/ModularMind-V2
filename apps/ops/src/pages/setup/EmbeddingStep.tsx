"use client";

import { ArrowLeft, ArrowRight, Check, Database, Loader2 } from "lucide-react";
import { type Step, EMBEDDING_MODELS, BTN_PRIMARY, BTN_SECONDARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface EmbeddingStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  embeddingModel: string;
  loading: boolean;
  onSelectEmbedding: (modelId: string) => void;
  onBack: () => void;
  onSaveEmbedding: () => void;
}

export function EmbeddingStep({
  step,
  stepIndex,
  error,
  embeddingModel,
  loading,
  onSelectEmbedding,
  onBack,
  onSaveEmbedding,
}: EmbeddingStepProps) {
  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error}>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Choose an embedding model for the knowledge base (RAG). This model
            converts documents into vectors for semantic search.
          </p>
        </div>

        <div className="space-y-2">
          {EMBEDDING_MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelectEmbedding(model.id)}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 transition-colors text-left ${
                embeddingModel === model.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  embeddingModel === model.id ? "bg-primary/10" : "bg-muted"
                }`}
              >
                <Database
                  className={`h-4 w-4 ${
                    embeddingModel === model.id
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{model.name}</span>
                  {model.recommended && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {model.dimensions} dimensions
                </p>
              </div>
              {embeddingModel === model.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onBack} className={`${BTN_SECONDARY} flex-1`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={onSaveEmbedding}
            disabled={loading}
            className={`${BTN_PRIMARY} flex-1`}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
