import type { Metadata } from "next";
import { SessionProvider } from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ModularMind — AI Agent Orchestration Platform",
  description: "Create, deploy, and manage AI agents with visual graph-based workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("mm-theme-mode");var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark");var h=localStorage.getItem("mm-theme-hue");var s=localStorage.getItem("mm-theme-saturation");if(h&&s){var l=d?65:58;var v=h+" "+s+"% "+l+"%";document.documentElement.style.setProperty("--primary",v);document.documentElement.style.setProperty("--ring",v);document.documentElement.style.setProperty("--sidebar-ring",v)}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider defaultMode="system">
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
