import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorResponse } from "@/lib/api-utils";
import { INTERNAL_TOKEN } from "@/lib/engine-proxy";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

// GET /api/chat/executions/:id/stream — SSE proxy passthrough
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  const { id } = await params;
  const engineUrl = `${ENGINE_URL}/api/v1/executions/${id}/stream`;

  const headers: Record<string, string> = {};
  if (INTERNAL_TOKEN) {
    headers["Authorization"] = `Bearer ${INTERNAL_TOKEN}`;
  }
  if (session.user?.email) {
    headers["X-Platform-User-Email"] = session.user.email;
  }

  const engineRes = await fetch(engineUrl, {
    headers,
    // @ts-expect-error -- Node.js fetch supports duplex for streaming
    duplex: "half",
  });

  if (!engineRes.ok || !engineRes.body) {
    return errorResponse("Failed to connect to execution stream", engineRes.status);
  }

  // Pipe the Engine SSE stream through to the client
  return new Response(engineRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
