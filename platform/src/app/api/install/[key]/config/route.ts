import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api-utils";

/**
 * GET /api/install/[key]/config — Return install configuration as JSON.
 * Includes platform URL, engine key, version, and GHCR registry credentials
 * so the client can `docker login` and pull private images.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const engine = await db.engine.findUnique({
    where: { apiKey: key },
    include: { client: true },
  });

  if (!engine) {
    return errorResponse("Invalid API key", 401);
  }

  const ghcrToken = process.env.GHCR_READ_TOKEN;
  if (!ghcrToken) {
    return errorResponse("Registry credentials not configured", 500);
  }

  const platformUrl =
    process.env.NEXTAUTH_URL ||
    process.env.PLATFORM_URL ||
    "https://modularmind-platform.tipaq.dev";

  // Merge deployment config defaults with stored config
  const defaults = {
    proxyPort: 8080,
    domain: "",
    useGpu: false,
    useTraefik: false,
    ollamaEnabled: true,
    monitoringEnabled: false,
    grafanaPort: 3333,
    mmVersion: "latest",
  };
  const deployment = { ...defaults, ...(engine.deploymentConfig as Record<string, unknown> ?? {}) };

  return NextResponse.json({
    platformUrl,
    engineKey: key,
    clientName: engine.client?.name ?? engine.name,
    version: deployment.mmVersion as string,
    registry: {
      server: "ghcr.io",
      username: "modularmind",
      password: ghcrToken,
    },
    deployment,
  });
}
