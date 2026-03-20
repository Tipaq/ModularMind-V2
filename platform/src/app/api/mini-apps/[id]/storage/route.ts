import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey } from "@/lib/api-utils";
import { listStorageKeys } from "@/lib/mini-apps";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const keys = await listStorageKeys(id);
  return NextResponse.json(keys);
}
