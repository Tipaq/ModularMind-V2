"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@modularmind/ui";
import { type Step, STEPS, apiFetch } from "./setup/types";
import { WelcomeStep } from "./setup/WelcomeStep";
import { AccountStep } from "./setup/AccountStep";
import { ProvidersStep } from "./setup/ProvidersStep";
import { OllamaStep } from "./setup/OllamaStep";
import { ModelsStep } from "./setup/ModelsStep";
import { EmbeddingStep } from "./setup/EmbeddingStep";
import { CompleteStep } from "./setup/CompleteStep";

export function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [runtimeName, setRuntimeName] = useState("");

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(["qwen3:8b"]));
  const [pullingModels, setPullingModels] = useState<Set<string>>(new Set());

  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaGpu, setOllamaGpu] = useState(false);

  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const goTo = (targetStep: Step) => {
    setError("");
    setStep(targetStep);
  };

  const goNext = () => {
    const currentIdx = STEPS.indexOf(step);
    const nextStep = STEPS[currentIdx + 1];
    if (!nextStep) return;

    if (step === "ollama" && !ollamaEnabled) {
      goTo("complete");
      return;
    }

    goTo(nextStep);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) goTo(prev);
  };

  const handleCreateAccount = async () => {
    setError("");
    setLoading(true);
    try {
      const initRes = await fetch("/api/v1/setup/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          runtime_name: runtimeName.trim(),
          default_provider: "ollama",
        }),
      });

      if (!initRes.ok) {
        const data = await initRes.json().catch(() => null);
        setError(data?.detail || `Setup failed (${initRes.status})`);
        setLoading(false);
        return;
      }

      const loggedIn = await useAuthStore.getState().login(email, password);
      if (!loggedIn) {
        setError("Account created but auto-login failed. Please log in manually.");
        setLoading(false);
        setTimeout(() => navigate("/login", { replace: true }), 2000);
        return;
      }

      setLoading(false);
      goNext();
    } catch {
      setError("Connection failed. Is the engine running?");
      setLoading(false);
    }
  };

  const handleSaveKey = async (providerId: string) => {
    const key = apiKeys[providerId]?.trim();
    if (!key) return;

    setSavingKey(providerId);
    try {
      const res = await apiFetch("/internal/settings", {
        method: "PATCH",
        body: JSON.stringify({ llm_api_keys: { [providerId]: key } }),
      });
      if (res.ok) {
        setSavedKeys((prev) => ({ ...prev, [providerId]: true }));
      } else {
        setError(`Failed to save ${providerId} key`);
      }
    } catch {
      setError(`Failed to save ${providerId} key`);
    }
    setSavingKey(null);
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const handlePullModels = async () => {
    setLoading(true);
    setError("");
    const toPull = [...selectedModels];
    let dispatched = 0;

    for (const modelId of toPull) {
      setPullingModels((prev) => new Set(prev).add(modelId));
      try {
        const res = await apiFetch("/models/pull", {
          method: "POST",
          body: JSON.stringify({ model_name: modelId }),
        });
        if (res.ok) dispatched++;
        else setError(`Failed to queue ${modelId} for download`);
      } catch {
        setError(`Failed to queue ${modelId} for download`);
      }
    }

    setLoading(false);
    if (dispatched > 0) goNext();
  };

  const handleSaveEmbedding = async () => {
    setLoading(true);
    setError("");
    try {
      const settingsRes = await apiFetch("/internal/settings", {
        method: "PATCH",
        body: JSON.stringify({ knowledge_embedding_model: embeddingModel }),
      });
      if (!settingsRes.ok) {
        setError("Failed to save embedding configuration");
        setLoading(false);
        return;
      }

      const pullRes = await apiFetch("/models/pull", {
        method: "POST",
        body: JSON.stringify({ model_name: embeddingModel }),
      });
      if (!pullRes.ok) {
        setError("Embedding saved but failed to queue model download");
      }
    } catch {
      setError("Failed to save embedding configuration");
      setLoading(false);
      return;
    }
    setLoading(false);
    goNext();
  };

  const sharedProps = { step, stepIndex, error };

  if (step === "welcome") {
    return <WelcomeStep {...sharedProps} onNext={goNext} />;
  }

  if (step === "account") {
    return (
      <AccountStep
        {...sharedProps}
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        runtimeName={runtimeName}
        loading={loading}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onRuntimeNameChange={setRuntimeName}
        onBack={goBack}
        onCreateAccount={handleCreateAccount}
      />
    );
  }

  if (step === "providers") {
    return (
      <ProvidersStep
        {...sharedProps}
        apiKeys={apiKeys}
        savedKeys={savedKeys}
        savingKey={savingKey}
        visibleKeys={visibleKeys}
        expandedProvider={expandedProvider}
        onApiKeyChange={(providerId, value) =>
          setApiKeys((prev) => ({ ...prev, [providerId]: value }))
        }
        onToggleVisibility={(providerId) =>
          setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
        }
        onExpandProvider={setExpandedProvider}
        onSaveKey={handleSaveKey}
        onBack={goBack}
        onNext={goNext}
      />
    );
  }

  if (step === "ollama") {
    return (
      <OllamaStep
        {...sharedProps}
        ollamaEnabled={ollamaEnabled}
        ollamaGpu={ollamaGpu}
        onOllamaEnabledChange={setOllamaEnabled}
        onOllamaGpuChange={setOllamaGpu}
        onBack={goBack}
        onNext={goNext}
      />
    );
  }

  if (step === "models") {
    return (
      <ModelsStep
        {...sharedProps}
        selectedModels={selectedModels}
        pullingModels={pullingModels}
        loading={loading}
        onToggleModel={toggleModel}
        onBack={goBack}
        onPullModels={handlePullModels}
        onSkip={goNext}
      />
    );
  }

  if (step === "embedding") {
    return (
      <EmbeddingStep
        {...sharedProps}
        embeddingModel={embeddingModel}
        loading={loading}
        onSelectEmbedding={setEmbeddingModel}
        onBack={goBack}
        onSaveEmbedding={handleSaveEmbedding}
      />
    );
  }

  return (
    <CompleteStep
      {...sharedProps}
      email={email}
      runtimeName={runtimeName}
      configuredProviderCount={Object.keys(savedKeys).length}
      selectedModelsCount={selectedModels.size}
      embeddingModel={embeddingModel}
      ollamaEnabled={ollamaEnabled}
    />
  );
}

export default Setup;
