"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generateAccentTokens } from "./utils";
import { getPreset, PRESETS } from "./presets";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeConfig {
  mode: ThemeMode;
  hue: number;
  saturation: number;
  preset: string;
}

export interface ThemeContextValue {
  /** Current resolved mode (never "system") */
  resolvedMode: "light" | "dark";
  /** Raw mode setting */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Accent hue (0-360) */
  hue: number;
  /** Accent saturation (0-100) */
  saturation: number;
  setAccent: (hue: number, saturation: number) => void;
  /** Active preset name */
  preset: string;
  setPreset: (name: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_MODE = "mm-theme-mode";
const STORAGE_HUE = "mm-theme-hue";
const STORAGE_SAT = "mm-theme-saturation";
const STORAGE_PRESET = "mm-theme-preset";

function getSystemDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStorage(): Partial<ThemeConfig> {
  if (typeof window === "undefined") return {};
  try {
    return {
      mode: (localStorage.getItem(STORAGE_MODE) as ThemeMode) || undefined,
      hue: localStorage.getItem(STORAGE_HUE)
        ? Number(localStorage.getItem(STORAGE_HUE))
        : undefined,
      saturation: localStorage.getItem(STORAGE_SAT)
        ? Number(localStorage.getItem(STORAGE_SAT))
        : undefined,
      preset: localStorage.getItem(STORAGE_PRESET) || undefined,
    };
  } catch {
    return {};
  }
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Org-level defaults (overridden by user localStorage) */
  defaultMode?: ThemeMode;
  defaultPreset?: string;
}

export function ThemeProvider({
  children,
  defaultMode = "system",
  defaultPreset = "default",
}: ThemeProviderProps) {
  const stored = useMemo(() => readStorage(), []);
  const defaultP = getPreset(stored.preset ?? defaultPreset) ?? PRESETS[0];

  const [mode, setModeState] = useState<ThemeMode>(stored.mode ?? defaultMode);
  const [hue, setHue] = useState(stored.hue ?? defaultP.hue);
  const [saturation, setSat] = useState(stored.saturation ?? defaultP.saturation);
  const [preset, setPresetState] = useState(stored.preset ?? defaultPreset);

  const resolvedMode: "light" | "dark" = useMemo(() => {
    if (mode === "system") return getSystemDark() ? "dark" : "light";
    return mode;
  }, [mode]);

  // Apply dark class
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedMode]);

  // Apply accent CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const tokens = generateAccentTokens(hue, saturation, resolvedMode === "dark");
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
  }, [hue, saturation, resolvedMode]);

  // Listen for system color scheme changes
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const root = document.documentElement;
      if (mq.matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_MODE, m); } catch {}
  }, []);

  const setAccent = useCallback((h: number, s: number) => {
    setHue(h);
    setSat(s);
    setPresetState("custom");
    try {
      localStorage.setItem(STORAGE_HUE, String(h));
      localStorage.setItem(STORAGE_SAT, String(s));
      localStorage.setItem(STORAGE_PRESET, "custom");
    } catch {}
  }, []);

  const setPreset = useCallback((name: string) => {
    const p = getPreset(name);
    if (!p) return;
    setPresetState(name);
    setHue(p.hue);
    setSat(p.saturation);
    try {
      localStorage.setItem(STORAGE_PRESET, name);
      localStorage.setItem(STORAGE_HUE, String(p.hue));
      localStorage.setItem(STORAGE_SAT, String(p.saturation));
    } catch {}
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedMode, mode, setMode, hue, saturation, setAccent, preset, setPreset }),
    [resolvedMode, mode, setMode, hue, saturation, setAccent, preset, setPreset],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
