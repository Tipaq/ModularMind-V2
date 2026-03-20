import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { getStorageValue, setStorageValue, deleteStorageValue } from "@/lib/mini-apps";

interface RouteParams { params: Promise<{ id: string; key: string }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id, key } = await params;
  const value = await getStorageValue(id, key);
  if (value === null) return errorResponse("Key not found", 404);

  return NextResponse.json({ key, value });
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id, key } = await params;
  const body = await req.json();

  try {
    await setStorageValue(id, key, body.value);
    return NextResponse.json({ key, success: true });
  } catch (e) {
    return errorResponse(`Storage error: ${e}`, 400);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id, key } = await params;
  await deleteStorageValue(id, key);
  return NextResponse.json({ success: true });
}
