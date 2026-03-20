import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { rollbackSnapshot } from "@/lib/mini-apps";

interface RouteParams { params: Promise<{ id: string; version: string }> }

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id, version } = await params;

  try {
    const result = await rollbackSnapshot(id, parseInt(version, 10));
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(`Rollback error: ${e}`, 500);
  }
}
