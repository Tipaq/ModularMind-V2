import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api-utils";

/**
 * GET /api/install/[key] — Serve the install script with pre-filled config.
 * The engine API key is validated, then install.sh is returned with
 * PLATFORM_URL and ENGINE_KEY injected so the client can just pipe to bash.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  // Validate engine API key
  const engine = await db.engine.findUnique({
    where: { apiKey: key },
    include: { client: true },
  });

  if (!engine) {
    return errorResponse("Invalid API key", 401);
  }

  // In standalone mode, process.cwd() is /app/platform (due to server.js chdir).
  // install.sh is at /app/install.sh.
  const scriptPath = join(process.cwd(), "..", "install.sh");
  let script: string;
  try {
    script = await readFile(scriptPath, "utf-8");
  } catch {
    return errorResponse("Install script not found", 500);
  }

  // Inject pre-filled values so the client doesn't need to pass --key or --platform-url
  const platformUrl =
    process.env.NEXTAUTH_URL ||
    process.env.PLATFORM_URL ||
    "https://modularmind-platform.tipaq.dev";

  script = script.replace(
    'ENGINE_KEY=""',
    `ENGINE_KEY="${key}"`,
  );
  script = script.replace(
    'PLATFORM_URL=""',
    `PLATFORM_URL="${platformUrl}"`,
  );

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Content-Disposition": 'attachment; filename="install.sh"',
    },
  });
}
