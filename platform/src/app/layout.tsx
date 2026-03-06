import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import { SessionGuard } from "@/components/SessionGuard";
import { ThemeProvider } from "@modularmind/ui";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Inline FOUC prevention script — must stay in sync with packages/ui/src/theme/utils.ts
 */
const FOUC_SCRIPT = `(function(){try{var m=localStorage.getItem("mm-theme-mode");var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark");var h=localStorage.getItem("mm-theme-hue");var s=localStorage.getItem("mm-theme-saturation");if(h&&s){var hn=Number(h),sn=Number(s);var l=d?65:58;var v=hn+" "+sn+"% "+l+"%";document.documentElement.style.setProperty("--primary",v);document.documentElement.style.setProperty("--ring",v);document.documentElement.style.setProperty("--sidebar-ring",v);var sh=(hn+40)%360;var ss=Math.round(Math.max(20,sn*0.5));var sl=d?20:92;var sfl=d?90:15;document.documentElement.style.setProperty("--secondary",sh+" "+ss+"% "+sl+"%");document.documentElement.style.setProperty("--secondary-foreground",sh+" "+ss+"% "+sfl+"%")}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "ModularMind — AI Agent Orchestration Platform",
  description: "Create, deploy, and manage AI agents with visual graph-based workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider defaultMode="system">
          <SessionProvider>
            <SessionGuard>{children}</SessionGuard>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
