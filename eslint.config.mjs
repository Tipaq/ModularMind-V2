import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/",
      "**/.next/",
      "**/node_modules/",
      "**/coverage/",
      "**/*.d.ts",
    ],
  },

  // ── Base: JS recommended + TS recommended ───────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── All TS/TSX files: browser globals ───────────────────────────────────
  {
    files: ["apps/**/*.{js,ts,tsx}", "packages/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // ── React hooks for all component/hook files ───────────────────────────
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // ── React Refresh: only Vite apps (not packages, not Next.js platform) ─
  {
    files: ["apps/**/*.tsx"],
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // ── Test files: relax unused-vars for test helpers ──────────────────────
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
