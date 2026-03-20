import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile } from "@/lib/mini-apps";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  const app = await db.miniApp.findUnique({ where: { id } });
  if (!app || !app.isActive) {
    return new NextResponse("Mini-app not found", { status: 404 });
  }

  const entryFile = await readFile(id, app.entryFile);
  if (!entryFile) {
    return new NextResponse("Entry file not found", { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const appApiBase = `${origin}/api/mini-apps/${id}`;
  const theme = req.nextUrl.searchParams.get("theme");
  const darkClass = theme === "dark" ? " class=\"dark\"" : "";

  const html = `<!DOCTYPE html>
<html lang="en"${darkClass}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${app.name}</title>
  <link rel="stylesheet" href="${origin}/sdk/modularmind-theme.css">
  <script>
    window.__MM_APP_ID__ = "${id}";
    window.__MM_API_BASE__ = "${appApiBase}";
    // Sync theme from parent via postMessage
    window.addEventListener("message", function(e) {
      if (e.data && e.data.source === "modularmind-parent" && e.data.type === "theme-changed") {
        document.documentElement.classList.toggle("dark", e.data.data === "dark");
      }
      if (e.data && e.data.source === "modularmind-parent" && e.data.type === "initialized") {
        document.documentElement.classList.toggle("dark", (e.data.data && e.data.data.theme) === "dark");
      }
    });
    // Auto-detect from parent if no query param
    if (!document.documentElement.classList.contains("dark") && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  </script>
  <script src="${origin}/sdk/modularmind-components.js"></script>
  <script src="${origin}/sdk/modularmind-sdk.js"></script>
</head>
<body>
  ${entryFile.content}
  <script>ModularMind.ready();</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}
