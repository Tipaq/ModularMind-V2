import { NextRequest } from "next/server";
import { requireAuth, errorResponse } from "@/lib/api-utils";
import { INTERNAL_TOKEN } from "@/lib/engine-proxy";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/chat/executions/:id/stream — SSE proxy
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const engineUrl = `${ENGINE_URL}/api/v1/executions/${id}/stream`;

  const proxyHeaders: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (INTERNAL_TOKEN) {
    proxyHeaders["Authorization"] = `Bearer ${INTERNAL_TOKEN}`;
  }
  if (session.user?.email) {
    proxyHeaders["X-Platform-User-Email"] = session.user.email;
  }

  console.log(`[SSE proxy] Connecting to ${engineUrl}`);

  // Use Node.js http module directly to avoid Next.js fetch buffering.
  // Force 127.0.0.1 instead of "localhost" to avoid IPv6 resolution on Windows
  // (Docker typically maps ports to 0.0.0.0 which is IPv4 only).
  const url = new URL(engineUrl);
  const resolvedHost =
    url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  const http = await import("http");

  return new Promise<Response>((resolve) => {
    const httpReq = http.request(
      {
        hostname: resolvedHost,
        port: url.port || 8000,
        path: url.pathname + url.search,
        method: "GET",
        headers: proxyHeaders,
      },
      (httpRes) => {
        console.log(`[SSE proxy] Engine responded with status ${httpRes.statusCode}`);

        if (httpRes.statusCode !== 200) {
          resolve(
            errorResponse(
              "Failed to connect to execution stream",
              httpRes.statusCode || 502,
            ),
          );
          return;
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            httpRes.on("data", (chunk: Buffer) => {
              const text = chunk.toString();
              console.log(`[SSE proxy] Forwarding ${text.length} bytes`);
              try {
                controller.enqueue(encoder.encode(text));
              } catch {
                // Stream closed
              }
            });
            httpRes.on("end", () => {
              console.log("[SSE proxy] Engine stream ended");
              try {
                controller.close();
              } catch {
                // Already closed
              }
            });
            httpRes.on("error", (err) => {
              console.error("[SSE proxy] Engine stream error:", err.message);
              try {
                controller.close();
              } catch {
                // Already closed
              }
            });

            // Close upstream if client disconnects
            req.signal.addEventListener("abort", () => {
              console.log("[SSE proxy] Client disconnected, destroying upstream");
              httpReq.destroy();
            });
          },
          cancel() {
            httpReq.destroy();
          },
        });

        resolve(
          new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          }),
        );
      },
    );

    httpReq.on("error", (err) => {
      console.error(`[SSE proxy] Connection failed: ${err.message}`);
      resolve(
        errorResponse(`Engine connection failed: ${err.message}`, 502),
      );
    });

    httpReq.end();
  });
}
