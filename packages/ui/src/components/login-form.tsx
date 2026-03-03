"use client";

import { useState, type ReactNode } from "react";
import { Bot } from "lucide-react";

export interface LoginFormProps {
  /** Called when the user submits the form. Return true on success, false on failure. */
  onLogin: (email: string, password: string) => Promise<boolean>;
  /** Called after a successful login. Use this to navigate. */
  onSuccess: () => void;
  /** Subtitle shown below "ModularMind". Defaults to "Sign in to continue". */
  subtitle?: string;
  /** Placeholder for the email input. Defaults to "you@example.com". */
  emailPlaceholder?: string;
  /** Optional footer (e.g. a "Register" link). */
  footer?: ReactNode;
}

export function LoginForm({
  onLogin,
  onSuccess,
  subtitle = "Sign in to continue",
  emailPlaceholder = "you@example.com",
  footer,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const ok = await onLogin(email, password);
    if (ok) {
      onSuccess();
    } else {
      setError("Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ModularMind</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={emailPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="login-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {footer && (
          <div className="text-center text-sm text-muted-foreground">{footer}</div>
        )}
      </div>
    </div>
  );
}
