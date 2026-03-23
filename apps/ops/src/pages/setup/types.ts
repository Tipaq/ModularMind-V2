"use client";

import type { LucideIcon } from "lucide-react";
import { Brain, Code, Cpu, Sparkles } from "lucide-react";

export type Step = "welcome" | "account" | "providers" | "models" | "embedding" | "complete";

export const STEPS: Step[] = ["welcome", "account", "providers", "models", "embedding", "complete"];

export const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  account: "Admin Account",
  providers: "LLM Providers",
  models: "Models",
  embedding: "Embedding",
  complete: "Complete",
};

export const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (password: string) => password.length >= 10 },
  { label: "Uppercase letter", test: (password: string) => /[A-Z]/.test(password) },
  { label: "Lowercase letter", test: (password: string) => /[a-z]/.test(password) },
  { label: "Digit", test: (password: string) => /\d/.test(password) },
  { label: "Special character", test: (password: string) => /[^a-zA-Z0-9]/.test(password) },
];

export const CLOUD_PROVIDERS = [
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

export interface OllamaModel {
  id: string;
  name: string;
  size: string;
  category: string;
  icon: LucideIcon;
  recommended?: boolean;
}

export const OLLAMA_MODELS: OllamaModel[] = [
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

export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  recommended?: boolean;
}

export const EMBEDDING_MODELS: EmbeddingModel[] = [
  { id: "nomic-embed-text", name: "Nomic Embed Text", dimensions: 768, recommended: true },
  { id: "mxbai-embed-large", name: "mxbai Embed Large", dimensions: 1024 },
  { id: "all-minilm", name: "All-MiniLM-L6", dimensions: 384 },
  { id: "snowflake-arctic-embed", name: "Snowflake Arctic Embed", dimensions: 1024 },
];

export const INPUT_CLASS =
  "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

export const BTN_PRIMARY =
  "flex h-10 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50";

export const BTN_SECONDARY =
  "flex h-10 items-center justify-center gap-2 rounded-lg border border-border font-medium hover:bg-muted transition-colors";

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
}
