import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@modularmind/ui";
import {
  Bot,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  Server,
  Loader2,
  Eye,
  EyeOff,
  Cloud,
  Cpu,
  Brain,
  Code,
  Sparkles,
  Database,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react";

// ─── Types & constants ──────────────────────────────────────────────────────

type Step = "welcome" | "account" | "providers" | "models" | "embedding" | "complete";

const STEPS: Step[] = ["welcome", "account", "providers", "models", "embedding", "complete"];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  account: "Admin Account",
  providers: "LLM Providers",
  models: "Models",
  embedding: "Embedding",
  complete: "Complete",
};

const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Digit", test: (p: string) => /\d/.test(p) },
  { label: "Special character", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

const CLOUD_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    color: "bg-success",
    placeholder: "sk-...",
    models: "GPT-4o, GPT-4o-mini, o1, o3",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    color: "bg-warning",
    placeholder: "sk-ant-...",
    models: "Claude Sonnet, Haiku, Opus",
  },
  {
    id: "google",
    name: "Google AI",
    color: "bg-info",
    placeholder: "AI...",
    models: "Gemini 2.0 Flash, 2.5 Pro",
  },
  {
    id: "mistral",
    name: "Mistral",
    color: "bg-accent",
    placeholder: "...",
    models: "Large, Small, Codestral",
  },
  {
    id: "cohere",
    name: "Cohere",
    color: "bg-secondary",
    placeholder: "...",
    models: "Command R+, Command R",
  },
  {
    id: "groq",
    name: "Groq",
    color: "bg-primary",
    placeholder: "gsk_...",
    models: "Llama, Mixtral (ultra-fast inference)",
  },
];

interface OllamaModel {
  id: string;
  name: string;
  size: string;
  category: string;
  icon: typeof Brain;
  recommended?: boolean;
}

const OLLAMA_MODELS: OllamaModel[] = [
  { id: "qwen3:8b", name: "Qwen 3 8B", size: "5.2 GB", category: "General", icon: Brain, recommended: true },
  { id: "qwen3:4b", name: "Qwen 3 4B", size: "2.7 GB", category: "Lightweight", icon: Cpu },
  { id: "llama3.2:3b", name: "Llama 3.2 3B", size: "2.0 GB", category: "Lightweight", icon: Cpu },
  { id: "gemma3:4b", name: "Gemma 3 4B", size: "3.0 GB", category: "Lightweight", icon: Cpu },
  { id: "mistral:7b", name: "Mistral 7B", size: "4.1 GB", category: "General", icon: Brain },
  { id: "gemma3:12b", name: "Gemma 3 12B", size: "8.1 GB", category: "General", icon: Brain },
  { id: "deepseek-r1:14b", name: "DeepSeek R1 14B", size: "9.0 GB", category: "Reasoning", icon: Sparkles },
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "4.7 GB", category: "Code", icon: Code },
  { id: "devstral:24b", name: "Devstral 24B", size: "14 GB", category: "Code", icon: Code },
];

const EMBEDDING_MODELS = [
  { id: "nomic-embed-text", name: "Nomic Embed Text", dimensions: 768, recommended: true },
  { id: "mxbai-embed-large", name: "mxbai Embed Large", dimensions: 1024 },
  { id: "all-minilm", name: "All-MiniLM-L6", dimensions: 384 },
  { id: "snowflake-arctic-embed", name: "Snowflake Arctic Embed", dimensions: 1024 },
];

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

const btnPrimary =
  "flex h-10 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50";

const btnSecondary =
  "flex h-10 items-center justify-center gap-2 rounded-lg border border-border font-medium hover:bg-muted transition-colors";

// ─── Helper: authenticated fetch ────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  return fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
}

// ─── Shared layout components ───────────────────────────────────────────────

function ProgressBar({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < stepIndex
              ? "w-6 bg-primary"
              : i === stepIndex
                ? "w-8 bg-primary"
                : "w-3 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function SetupWrapper({
  children,
  wide,
  step,
  stepIndex,
  error,
}: {
  children: React.ReactNode;
  wide?: boolean;
  step: Step;
  stepIndex: number;
  error: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} space-y-6`}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60">
            <Bot className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">ModularMind</h1>
            <p className="mt-1 text-sm text-muted-foreground">{STEP_LABELS[step]}</p>
          </div>
        </div>

        <ProgressBar stepIndex={stepIndex} />

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  // Account form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [runtimeName, setRuntimeName] = useState("");

  // Providers
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Models
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(["qwen3:8b"]));
  const [pullingModels, setPullingModels] = useState<Set<string>>(new Set());

  // Embedding
  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");

  // UI
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const allPasswordRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canProceedFromAccount =
    allPasswordRulesPass && passwordsMatch && email.includes("@") && runtimeName.trim().length > 0;

  const goTo = (s: Step) => {
    setError("");
    setStep(s);
  };

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) goTo(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) goTo(prev);
  };

  // ── Step 2: Create account + auto-login ──

  const handleCreateAccount = async () => {
    setError("");
    setLoading(true);

    try {
      // 1. Initialize
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

      // 2. Auto-login (via auth store so session is persisted client-side)
      const loggedIn = await useAuthStore.getState().login(email, password);

      if (!loggedIn) {
        // Account created but login failed — redirect to login page
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

  // ── Step 3: Save API key ──

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

  // ── Step 4: Pull model ──

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

  // ── Step 5: Save embedding ──

  const handleSaveEmbedding = async () => {
    setLoading(true);
    setError("");
    try {
      // Save embedding setting
      const settingsRes = await apiFetch("/internal/settings", {
        method: "PATCH",
        body: JSON.stringify({ knowledge_embedding_model: embeddingModel }),
      });
      if (!settingsRes.ok) {
        setError("Failed to save embedding configuration");
        setLoading(false);
        return;
      }

      // Also pull the embedding model
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

  const configuredProviderCount = Object.keys(savedKeys).length;

  const wrapperProps = { step, stepIndex, error };

  // ─── STEP: Welcome ────────────────────────────────────────────────────────

  if (step === "welcome") {
    return (
      <SetupWrapper {...wrapperProps}>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-lg font-semibold">Welcome</h2>
            <p className="text-sm text-muted-foreground">
              Let's set up your ModularMind instance. You'll create an admin
              account and configure your AI models.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: Server, label: "Account" },
              { icon: Cloud, label: "Providers" },
              { icon: Brain, label: "Models" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-lg border border-border p-3 space-y-2"
              >
                <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <button onClick={goNext} className={`${btnPrimary} w-full`}>
            Get started
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </SetupWrapper>
    );
  }

  // ─── STEP: Account ────────────────────────────────────────────────────────

  if (step === "account") {
    return (
      <SetupWrapper {...wrapperProps}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="setup-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className={inputClass}
              placeholder="admin@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="setup-password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={inputClass}
                placeholder="••••••••••"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="setup-confirm" className="text-sm font-medium">
                Confirm
              </label>
              <input
                id="setup-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={inputClass}
                placeholder="••••••••••"
              />
            </div>
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}

          {password.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {PASSWORD_RULES.map((rule) => {
                const pass = rule.test(password);
                return (
                  <div
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-xs ${
                      pass ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {rule.label}
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="setup-runtime" className="text-sm font-medium">
              Instance Name
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="setup-runtime"
                type="text"
                value={runtimeName}
                onChange={(e) => setRuntimeName(e.target.value)}
                required
                className={`${inputClass} pl-9`}
                placeholder="My Server"
                maxLength={100}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={goBack} className={`${btnSecondary} flex-1`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleCreateAccount}
              disabled={!canProceedFromAccount || loading}
              className={`${btnPrimary} flex-1`}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
            </button>
          </div>
        </div>
      </SetupWrapper>
    );
  }

  // ─── STEP: Providers ──────────────────────────────────────────────────────

  if (step === "providers") {
    return (
      <SetupWrapper {...wrapperProps} wide>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Add API keys for cloud LLM providers. Ollama is included for local models.
            </p>
          </div>

          {/* Ollama card */}
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

          {/* Cloud providers */}
          <div className="space-y-2">
            {CLOUD_PROVIDERS.map((p) => {
              const isExpanded = expandedProvider === p.id;
              const isSaved = savedKeys[p.id];
              const key = apiKeys[p.id] || "";
              const isVisible = visibleKeys[p.id];

              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedProvider(isExpanded ? null : p.id)
                    }
                    className="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${p.color}/10`}
                    >
                      <Cloud className={`h-4 w-4 ${p.color.replace("bg-", "text-")}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium">{p.name}</span>
                      <p className="text-xs text-muted-foreground">{p.models}</p>
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
                            onChange={(e) =>
                              setApiKeys((prev) => ({
                                ...prev,
                                [p.id]: e.target.value,
                              }))
                            }
                            className={`${inputClass} pr-10`}
                            placeholder={p.placeholder}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleKeys((prev) => ({
                                ...prev,
                                [p.id]: !prev[p.id],
                              }))
                            }
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
                          onClick={() => handleSaveKey(p.id)}
                          disabled={!key.trim() || savingKey === p.id}
                          className={`${btnPrimary} px-4`}
                        >
                          {savingKey === p.id ? (
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
            <button onClick={goBack} className={`${btnSecondary} flex-1`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button onClick={goNext} className={`${btnPrimary} flex-1`}>
              {configuredProviderCount > 0
                ? "Next"
                : "Skip for now"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SetupWrapper>
    );
  }

  // ─── STEP: Models ─────────────────────────────────────────────────────────

  if (step === "models") {
    return (
      <SetupWrapper {...wrapperProps} wide>
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
                  onClick={() => toggleModel(model.id)}
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
            <button onClick={goBack} className={`${btnSecondary} flex-1`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={selectedModels.size > 0 ? handlePullModels : goNext}
              disabled={loading}
              className={`${btnPrimary} flex-1`}
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
      </SetupWrapper>
    );
  }

  // ─── STEP: Embedding ──────────────────────────────────────────────────────

  if (step === "embedding") {
    return (
      <SetupWrapper {...wrapperProps}>
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
                onClick={() => setEmbeddingModel(model.id)}
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
            <button onClick={goBack} className={`${btnSecondary} flex-1`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleSaveEmbedding}
              disabled={loading}
              className={`${btnPrimary} flex-1`}
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
      </SetupWrapper>
    );
  }

  // ─── STEP: Complete ───────────────────────────────────────────────────────

  return (
    <SetupWrapper {...wrapperProps}>
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

        {/* Summary */}
        <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Admin</span>
            <span className="font-medium">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Instance</span>
            <span className="font-medium">{runtimeName}</span>
          </div>
          {configuredProviderCount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cloud providers</span>
              <span className="font-medium">{configuredProviderCount} configured</span>
            </div>
          )}
          {selectedModels.size > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ollama models</span>
              <span className="font-medium">
                {selectedModels.size} pulling in background
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Embedding</span>
            <span className="font-medium">
              {EMBEDDING_MODELS.find((m) => m.id === embeddingModel)?.name}
            </span>
          </div>
        </div>

        {selectedModels.size > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Model downloads continue in the background. Check progress in the Models page.
          </p>
        )}

        <button
          onClick={() => { window.location.href = "/ops/"; }}
          className={`${btnPrimary} w-full`}
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </SetupWrapper>
  );
}
