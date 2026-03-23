"use client";

import { Bot } from "lucide-react";
import { type Step, STEPS, STEP_LABELS } from "./types";

interface ProgressBarProps {
  stepIndex: number;
}

function ProgressBar({ stepIndex }: ProgressBarProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((stepName, index) => (
        <div
          key={stepName}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            index < stepIndex
              ? "w-6 bg-primary"
              : index === stepIndex
                ? "w-8 bg-primary"
                : "w-3 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

interface SetupLayoutProps {
  children: React.ReactNode;
  wide?: boolean;
  step: Step;
  stepIndex: number;
  error: string;
}

export function SetupLayout({ children, wide, step, stepIndex, error }: SetupLayoutProps) {
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
