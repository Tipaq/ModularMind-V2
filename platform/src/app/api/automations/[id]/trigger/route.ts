import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { engineFetch } from "@/lib/engine-proxy";

// POST /api/automations/:id/trigger — Trigger an automation manually (proxy to engine)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const automation = await db.automation.findUnique({ where: { id } });
  if (!automation) return errorResponse("Not found", 404);
  if (!automation.enabled) return errorResponse("Automation is disabled", 400);

  const res = await engineFetch(
    `/api/v1/automations/${id}/trigger`,
    { method: "POST" },
    session?.user?.email ?? undefined,
  );

  if (!res.ok) {
    const body = await res.text();
    return errorResponse(`Engine error: ${body}`, res.status);
  }

  const data = await res.json();
  return NextResponse.json(data);
}
