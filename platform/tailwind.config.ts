import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{ts,tsx,js,jsx}",
    "../packages/ui/src/**/*.{ts,tsx,js,jsx}",
  ],
} satisfies Config;
