import { NextRequest } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { INTERNAL_TOKEN } from "@/lib/engine-proxy";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

// Force Node.js runtime + disable static optimization for SSE
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/chat/executions/:id/stream — SSE proxy with per-chunk flushing
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const engineUrl = `${ENGINE_URL}/api/v1/executions/${id}/stream`;

  const headers: Record<string, string> = {};
  if (INTERNAL_TOKEN) {
    headers["Authorization"] = `Bearer ${INTERNAL_TOKEN}`;
  }
  if (session.user?.email) {
    headers["X-Platform-User-Email"] = session.user.email;
  }

  const engineRes = await fetch(engineUrl, { headers });

  if (!engineRes.ok || !engineRes.body) {
    return errorResponse("Failed to connect to execution stream", engineRes.status);
  }

  // Use TransformStream as pass-through to break Next.js response buffering.
  // pipeTo() runs in the background, pushing each chunk from the engine
  // through to the client immediately.
  const { readable, writable } = new TransformStream();
  engineRes.body.pipeTo(writable).catch(() => {});

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
