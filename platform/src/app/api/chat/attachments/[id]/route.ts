import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { INTERNAL_TOKEN } from "@/lib/engine-proxy";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

// GET /api/chat/attachments/:id — Serve attachment file
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const headers: Record<string, string> = {};
  if (INTERNAL_TOKEN) {
    headers["Authorization"] = `Bearer ${INTERNAL_TOKEN}`;
  }
  if (session.user?.email) {
    headers["X-Platform-User-Email"] = session.user.email;
  }

  const res = await fetch(
    `${ENGINE_URL}/api/v1/conversations/attachments/${id}`,
    { headers },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Attachment not found" },
      { status: res.status },
    );
  }

  // Stream the file back with the same headers
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Disposition": res.headers.get("Content-Disposition") || "",
    },
  });
}
