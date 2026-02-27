import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ModularMind — AI Agent Orchestration Platform",
  description: "Create, deploy, and manage AI agents with visual graph-based workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
