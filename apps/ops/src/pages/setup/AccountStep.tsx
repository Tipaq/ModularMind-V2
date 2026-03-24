"use client";

import { ArrowLeft, Check, X, Loader2 } from "lucide-react";
import { type Step, PASSWORD_RULES, INPUT_CLASS, BTN_PRIMARY, BTN_SECONDARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface AccountStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  email: string;
  password: string;
  confirmPassword: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onBack: () => void;
  onCreateAccount: () => void;
}

export function AccountStep({
  step,
  stepIndex,
  error,
  email,
  password,
  confirmPassword,
  loading,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onBack,
  onCreateAccount,
}: AccountStepProps) {
  const allPasswordRulesPass = PASSWORD_RULES.every((rule) => rule.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canProceed = allPasswordRulesPass && passwordsMatch && email.includes("@");

  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">
          Create the admin account for your instance.
        </p>

        <div className="space-y-2">
          <label htmlFor="setup-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="setup-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
            autoFocus
            className={INPUT_CLASS}
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
              onChange={(e) => onPasswordChange(e.target.value)}
              required
              className={INPUT_CLASS}
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
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              required
              className={INPUT_CLASS}
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
              const isPass = rule.test(password);
              return (
                <div
                  key={rule.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    isPass ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {isPass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {rule.label}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onBack} className={`${BTN_SECONDARY} flex-1`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={onCreateAccount}
            disabled={!canProceed || loading}
            className={`${BTN_PRIMARY} flex-1`}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
