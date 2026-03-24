import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { errorResponse } from "@/lib/api-utils";

/**
 * GET /api/install/compose — Serve docker-compose.yml.
 * Public endpoint (no auth needed — the compose file isn't secret).
 */
export async function GET() {
  // In standalone mode, process.cwd() is /app/platform (due to server.js chdir).
  const composePath = join(process.cwd(), "..", "docker", "docker-compose.yml");
  let content: string;
  try {
    content = await readFile(composePath, "utf-8");
  } catch {
    return errorResponse("Compose file not found", 500);
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/x-yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="docker-compose.yml"',
    },
  });
}
