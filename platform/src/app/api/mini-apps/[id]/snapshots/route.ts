import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { createSnapshot, listSnapshots } from "@/lib/mini-apps";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const snapshots = await listSnapshots(id);
  return NextResponse.json(snapshots);
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const snapshot = await createSnapshot(id, body.label);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (e) {
    return errorResponse(`Snapshot error: ${e}`, 500);
  }
}
