"use client";

import { ArrowRight, KeyRound, Server, BookOpen } from "lucide-react";
import { type Step, BTN_PRIMARY } from "./types";
import { SetupLayout } from "./SetupLayout";

interface WelcomeStepProps {
  step: Step;
  stepIndex: number;
  error: string;
  onNext: () => void;
}

const SETUP_FEATURES = [
  { icon: KeyRound, label: "Account" },
  { icon: Server, label: "AI Providers" },
  { icon: BookOpen, label: "Knowledge" },
];

export function WelcomeStep({ step, stepIndex, error, onNext }: WelcomeStepProps) {
  return (
    <SetupLayout step={step} stepIndex={stepIndex} error={error}>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Welcome</h2>
          <p className="text-sm text-muted-foreground">
            Let's set up your ModularMind instance. You'll create an admin
            account and configure your AI providers.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {SETUP_FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="rounded-lg border border-border p-3 space-y-2"
            >
              <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <button onClick={onNext} className={`${BTN_PRIMARY} w-full`}>
          Get started
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </SetupLayout>
  );
}
