import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Check, X, ArrowRight, ArrowLeft, Server, Loader2 } from "lucide-react";

type Step = "welcome" | "account" | "runtime";

const STEPS: Step[] = ["welcome", "account", "runtime"];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  account: "Admin Account",
  runtime: "Configuration",
};

const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Digit", test: (p: string) => /\d/.test(p) },
  { label: "Special character", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [runtimeName, setRuntimeName] = useState("");
  const [provider, setProvider] = useState("ollama");

  // UI state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const allPasswordRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const canProceedFromAccount = allPasswordRulesPass && passwordsMatch && email.includes("@");
  const canProceedFromRuntime = runtimeName.trim().length > 0;

  const goNext = () => {
    setError("");
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    setError("");
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/setup/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          runtime_name: runtimeName.trim(),
          default_provider: provider,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail || `Setup failed (${res.status})`);
        setLoading(false);
        return;
      }

      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch {
      setError("Connection failed. Is the engine running?");
      setLoading(false);
    }
  };

  // ── Success screen ──
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 px-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-xl font-bold">Setup Complete</h2>
          <p className="text-sm text-muted-foreground">
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ModularMind</h1>
          <p className="text-sm text-muted-foreground">
            {step === "welcome" ? "Initial Setup" : STEP_LABELS[step]}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                i <= stepIndex
                  ? "w-8 bg-primary"
                  : "w-2 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Step: Welcome ── */}
        {step === "welcome" && (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-semibold">Welcome</h2>
              <p className="text-sm text-muted-foreground">
                Let's set up your ModularMind instance. You'll create an admin
                account and configure your runtime.
              </p>
            </div>
            <button
              onClick={goNext}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Step: Account ── */}
        {step === "account" && (
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
                Confirm Password
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
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            {/* Password strength */}
            {password.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                {PASSWORD_RULES.map((rule) => {
                  const pass = rule.test(password);
                  return (
                    <div
                      key={rule.label}
                      className={`flex items-center gap-2 text-xs ${
                        pass ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {pass ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      {rule.label}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border font-medium hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={goNext}
                disabled={!canProceedFromAccount}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Runtime ── */}
        {step === "runtime" && (
          <div className="space-y-4">
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
                  autoFocus
                  className={`${inputClass} pl-9`}
                  placeholder="My Server"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="setup-provider" className="text-sm font-medium">
                Default LLM Provider
              </label>
              <select
                id="setup-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={inputClass}
              >
                <option value="ollama">Ollama (local, included)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {provider === "ollama"
                  ? "Runs locally — no API key needed. Default model: qwen3:8b"
                  : provider === "openai"
                    ? "Requires an OpenAI API key. Default model: gpt-4o"
                    : "Requires an Anthropic API key. Default model: claude-sonnet-4-5"}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border font-medium hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canProceedFromRuntime || loading}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Complete Setup"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
