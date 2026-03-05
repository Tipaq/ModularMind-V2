import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { INTERNAL_TOKEN } from "@/lib/engine-proxy";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

// POST /api/chat/conversations/:id/attachments — Upload attachment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  // Forward the multipart form data directly to the Engine
  const formData = await req.formData();

  const headers: Record<string, string> = {};
  if (INTERNAL_TOKEN) {
    headers["Authorization"] = `Bearer ${INTERNAL_TOKEN}`;
  }
  if (session.user?.email) {
    headers["X-Platform-User-Email"] = session.user.email;
  }

  const res = await fetch(
    `${ENGINE_URL}/api/v1/conversations/${id}/attachments`,
    {
      method: "POST",
      headers,
      body: formData,
    },
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
