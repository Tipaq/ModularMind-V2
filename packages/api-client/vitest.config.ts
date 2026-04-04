import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-client",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.d.ts", "**/index.ts"],
    },
  },
});
