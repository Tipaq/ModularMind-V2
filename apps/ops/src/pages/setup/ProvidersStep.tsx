"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  Server,
  Zap,
} from "lucide-react";
import {
  type Step,
  type OllamaModel,
  CLOUD_PROVIDERS,
  OLLAMA_MODELS,
  INPUT_CLASS,
  BTN_PRIMARY,
  BTN_SECONDARY,
} from "./types";
import { SetupLayout } from "./SetupLayout";

interface ProvidersStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  ollamaEnabled: boolean;
  ollamaGpu: boolean;
  selectedModels: Set<string>;
  apiKeys: Record<string, string>;
  savedKeys: Record<string, boolean>;
  savingKey: string | null;
  visibleKeys: Record<string, boolean>;
  expandedProvider: string | null;
  onOllamaEnabledChange: (enabled: boolean) => void;
  onOllamaGpuChange: (gpu: boolean) => void;
  onToggleModel: (modelId: string) => void;
  onApiKeyChange: (providerId: string, value: string) => void;
  onToggleVisibility: (providerId: string) => void;
  onExpandProvider: (providerId: string | null) => void;
  onSaveKey: (providerId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function ModelCheckbox({
  model,
  selected,
  onToggle,
}: {
  model: OllamaModel;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = model.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/30"
      }`}
    >
      <div className={`flex h-5 w-5 items-center justify-center rounded border ${
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
      }`}>
        {selected && <Check className="h-3 w-3" />}
      </div>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">{model.name}</span>
        {model.recommended && (
          <span className="ml-1.5 text-[10px] text-primary">Recommended</span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{model.size}</span>
    </button>
  );
}

export function ProvidersStep({
  step,
  stepIndex,
  error,
  ollamaEnabled,
  ollamaGpu,
  selectedModels,
  apiKeys,
  savedKeys,
  savingKey,
  visibleKeys,
  expandedProvider,
  onOllamaEnabledChange,
  onOllamaGpuChange,
  onToggleModel,
  onApiKeyChange,
  onToggleVisibility,
  onExpandProvider,
  onSaveKey,
  onBack,
  onNext,
}: ProvidersStepProps) {
  const configuredCount = Object.keys(savedKeys).length;
  const hasAnyProvider = ollamaEnabled || configuredCount > 0;

  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error} wide>
      <div className="space-y-5">
        {/* ── Local Models (Ollama) ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Local Models</h3>
          </div>

          <button
            type="button"
            onClick={() => onOllamaEnabledChange(!ollamaEnabled)}
            className={`w-full rounded-xl border-2 p-3.5 text-left transition-all ${
              ollamaEnabled
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                ollamaEnabled ? "bg-primary/10" : "bg-muted"
              }`}>
                <Server className={`h-4 w-4 ${ollamaEnabled ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Enable Ollama</p>
                <p className="text-xs text-muted-foreground">
                  Run open-source models locally — no API keys needed
                </p>
              </div>
              <div className={`h-5 w-9 rounded-full transition-colors ${
                ollamaEnabled ? "bg-primary" : "bg-muted"
              }`}>
                <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                  ollamaEnabled ? "translate-x-4.5" : "translate-x-0.5"
                }`} />
              </div>
            </div>
          </button>

          {ollamaEnabled && (
            <div className="space-y-3 pl-1">
              <button
                type="button"
                onClick={() => onOllamaGpuChange(!ollamaGpu)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                  ollamaGpu ? "border-warning bg-warning/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <Zap className={`h-3.5 w-3.5 ${ollamaGpu ? "text-warning" : "text-muted-foreground"}`} />
                <span className="text-xs font-medium flex-1">GPU Acceleration</span>
                <div className={`h-4 w-7 rounded-full transition-colors ${
                  ollamaGpu ? "bg-warning" : "bg-muted"
                }`}>
                  <div className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                    ollamaGpu ? "translate-x-3.5" : "translate-x-0.5"
                  }`} />
                </div>
              </button>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Models to download</p>
                <div className="grid gap-1.5">
                  {OLLAMA_MODELS.map((model) => (
                    <ModelCheckbox
                      key={model.id}
                      model={model}
                      selected={selectedModels.has(model.id)}
                      onToggle={() => onToggleModel(model.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* ── Cloud Providers ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Cloud Providers</h3>
          </div>

          <div className="space-y-1.5">
            {CLOUD_PROVIDERS.map((provider) => {
              const isExpanded = expandedProvider === provider.id;
              const isSaved = savedKeys[provider.id];
              const key = apiKeys[provider.id] || "";
              const isVisible = visibleKeys[provider.id];

              return (
                <div key={provider.id} className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onExpandProvider(isExpanded ? null : provider.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${provider.color}/10`}>
                      <Cloud className={`h-3.5 w-3.5 ${provider.color.replace("bg-", "text-")}`} />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <span className="text-xs font-medium">{provider.name}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{provider.models}</p>
                    </div>
                    {isSaved && <Check className="h-3.5 w-3.5 text-success shrink-0" />}
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-3 pb-2.5 pt-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={isVisible ? "text" : "password"}
                            value={key}
                            onChange={(e) => onApiKeyChange(provider.id, e.target.value)}
                            className={`${INPUT_CLASS} pr-10 h-9 text-xs`}
                            placeholder={provider.placeholder}
                          />
                          <button
                            type="button"
                            onClick={() => onToggleVisibility(provider.id)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <button
                          onClick={() => onSaveKey(provider.id)}
                          disabled={!key.trim() || savingKey === provider.id}
                          className={`${BTN_PRIMARY} px-3 h-9 text-xs`}
                        >
                          {savingKey === provider.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isSaved ? (
                            <Check className="h-3.5 w-3.5" />
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
        </div>

        {/* ── Navigation ── */}
        <div className="flex gap-3 pt-1">
          <button onClick={onBack} className={`${BTN_SECONDARY} flex-1`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={onNext} className={`${BTN_PRIMARY} flex-1`}>
            {hasAnyProvider ? "Continue" : "Skip for now"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
