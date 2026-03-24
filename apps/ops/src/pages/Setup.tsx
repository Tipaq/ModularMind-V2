"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@modularmind/ui";
import { type Step, STEPS, apiFetch } from "./setup/types";
import { WelcomeStep } from "./setup/WelcomeStep";
import { AccountStep } from "./setup/AccountStep";
import { ProvidersStep } from "./setup/ProvidersStep";
import { KnowledgeStep } from "./setup/KnowledgeStep";

export function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaGpu, setOllamaGpu] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(["qwen3:8b"]));

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const goTo = (targetStep: Step) => {
    setError("");
    setStep(targetStep);
  };

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) goTo(next);
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
          runtime_name: "ModularMind",
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

  const handleFinish = async () => {
    setError("");

    if (ollamaEnabled) {
      apiFetch("/internal/ollama/start", {
        method: "POST",
        body: JSON.stringify({ gpu_enabled: ollamaGpu }),
      })
        .then(async (res) => {
          if (!res.ok) return;

          for (const modelId of selectedModels) {
            await apiFetch("/models/pull", {
              method: "POST",
              body: JSON.stringify({ model_name: modelId }),
            }).catch(() => {});
          }

          if (embeddingModel) {
            await apiFetch("/internal/settings", {
              method: "PATCH",
              body: JSON.stringify({ knowledge_embedding_model: embeddingModel }),
            }).catch(() => {});

            await apiFetch("/models/pull", {
              method: "POST",
              body: JSON.stringify({ model_name: embeddingModel }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    navigate("/configuration", { replace: true });
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
        loading={loading}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onBack={goBack}
        onCreateAccount={handleCreateAccount}
      />
    );
  }

  if (step === "providers") {
    return (
      <ProvidersStep
        {...sharedProps}
        ollamaEnabled={ollamaEnabled}
        ollamaGpu={ollamaGpu}
        selectedModels={selectedModels}
        apiKeys={apiKeys}
        savedKeys={savedKeys}
        savingKey={savingKey}
        visibleKeys={visibleKeys}
        expandedProvider={expandedProvider}
        onOllamaEnabledChange={setOllamaEnabled}
        onOllamaGpuChange={setOllamaGpu}
        onToggleModel={toggleModel}
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

  return (
    <KnowledgeStep
      {...sharedProps}
      ollamaEnabled={ollamaEnabled}
      embeddingModel={embeddingModel}
      onSelectEmbedding={setEmbeddingModel}
      onBack={goBack}
      onFinish={handleFinish}
    />
  );
}

export default Setup;
