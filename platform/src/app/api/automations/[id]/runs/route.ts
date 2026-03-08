import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { engineFetch } from "@/lib/engine-proxy";

// GET /api/automations/:id/runs — Get run history (proxy to engine)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const automation = await db.automation.findUnique({ where: { id } });
  if (!automation) return errorResponse("Not found", 404);

  const url = new URL(req.url);
  const queryString = url.searchParams.toString();
  const path = `/api/v1/automations/${id}/runs${queryString ? `?${queryString}` : ""}`;

  const res = await engineFetch(path, { method: "GET" }, session?.user?.email ?? undefined);

  if (!res.ok) {
    const body = await res.text();
    return errorResponse(`Engine error: ${body}`, res.status);
  }

  const data = await res.json();
  return NextResponse.json(data);
}
