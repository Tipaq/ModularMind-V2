"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Cpu, Loader2, Server, Zap } from "lucide-react";
import { type Step, BTN_PRIMARY, BTN_SECONDARY, apiFetch } from "./types";
import { SetupLayout } from "./SetupLayout";

interface OllamaStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  ollamaEnabled: boolean;
  ollamaGpu: boolean;
  onOllamaEnabledChange: (enabled: boolean) => void;
  onOllamaGpuChange: (gpu: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}

export function OllamaStep({
  step,
  stepIndex,
  error,
  ollamaEnabled,
  ollamaGpu,
  onOllamaEnabledChange,
  onOllamaGpuChange,
  onBack,
  onNext,
}: OllamaStepProps) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const handleNext = async () => {
    if (!ollamaEnabled) {
      onNext();
      return;
    }

    setStarting(true);
    setStartError("");

    try {
      const response = await apiFetch("/internal/ollama/start", {
        method: "POST",
        body: JSON.stringify({ gpu_enabled: ollamaGpu }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setStartError(data.detail || "Failed to start Ollama");
        setStarting(false);
        return;
      }

      onNext();
    } catch {
      setStartError("Network error — could not reach the server");
    } finally {
      setStarting(false);
    }
  };

  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">
          Ollama runs AI models locally on your server. Enable it to use open-source models without cloud API keys.
        </p>

        <button
          type="button"
          onClick={() => onOllamaEnabledChange(!ollamaEnabled)}
          className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
            ollamaEnabled
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${
              ollamaEnabled ? "bg-primary/10" : "bg-muted"
            }`}>
              <Server className={`h-5 w-5 ${ollamaEnabled ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Enable Ollama</p>
                <div className={`h-5 w-9 rounded-full transition-colors ${
                  ollamaEnabled ? "bg-primary" : "bg-muted"
                }`}>
                  <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                    ollamaEnabled ? "translate-x-4.5" : "translate-x-0.5"
                  }`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Run Llama, Qwen, Gemma, Mistral and more — directly on your hardware
              </p>
            </div>
          </div>
        </button>

        {ollamaEnabled && (
          <button
            type="button"
            onClick={() => onOllamaGpuChange(!ollamaGpu)}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              ollamaGpu
                ? "border-warning bg-warning/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${
                ollamaGpu ? "bg-warning/10" : "bg-muted"
              }`}>
                <Zap className={`h-5 w-5 ${ollamaGpu ? "text-warning" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">GPU Acceleration</p>
                  <div className={`h-5 w-9 rounded-full transition-colors ${
                    ollamaGpu ? "bg-warning" : "bg-muted"
                  }`}>
                    <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                      ollamaGpu ? "translate-x-4.5" : "translate-x-0.5"
                    }`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Use NVIDIA GPU for faster inference. Requires NVIDIA drivers and container toolkit.
                </p>
              </div>
            </div>
          </button>
        )}

        {!ollamaEnabled && (
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-center">
            <Cpu className="mx-auto h-5 w-5 text-muted-foreground mb-1.5" />
            <p className="text-xs text-muted-foreground">
              You can enable Ollama later from the Configuration page.
              Cloud providers (OpenAI, Anthropic, etc.) will still be available.
            </p>
          </div>
        )}

        {startError && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {startError}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button className={`${BTN_SECONDARY} flex-1 px-4`} onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            className={`${BTN_PRIMARY} flex-1 px-4`}
            onClick={handleNext}
            disabled={starting}
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting Ollama...
              </>
            ) : (
              <>
                {ollamaEnabled ? "Start & Continue" : "Skip"} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
