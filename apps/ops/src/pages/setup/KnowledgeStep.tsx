"use client";

import { ArrowLeft, BookOpen, Check, Loader2, Server } from "lucide-react";
import { type Step, EMBEDDING_MODELS, BTN_PRIMARY, BTN_SECONDARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface KnowledgeStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  loading: boolean;
  ollamaEnabled: boolean;
  embeddingModel: string;
  onSelectEmbedding: (modelId: string) => void;
  onBack: () => void;
  onFinish: () => void;
}

export function KnowledgeStep({
  step,
  stepIndex,
  error,
  loading,
  ollamaEnabled,
  embeddingModel,
  onSelectEmbedding,
  onBack,
  onFinish,
}: KnowledgeStepProps) {
  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error}>
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Choose an embedding model for document search and RAG.
          </p>
        </div>

        {ollamaEnabled ? (
          <div className="space-y-2">
            {EMBEDDING_MODELS.map((model) => {
              const isSelected = embeddingModel === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onSelectEmbedding(model.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    isSelected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.recommended && (
                        <span className="text-[10px] text-primary font-medium">Recommended</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{model.dimensions} dimensions</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border p-6 text-center space-y-3">
            <Server className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Ollama required</p>
              <p className="text-xs text-muted-foreground">
                Document search and RAG need a local embedding model running on Ollama.
                You can enable it later from Configuration &gt; Infrastructure.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onBack} disabled={loading} className={`${BTN_SECONDARY} flex-1`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={onFinish} disabled={loading} className={`${BTN_PRIMARY} flex-1`}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {ollamaEnabled ? "Starting Ollama..." : "Finishing..."}
              </>
            ) : (
              ollamaEnabled ? "Finish Setup" : "Skip & Finish"
            )}
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
