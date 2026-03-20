import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { readFile, deleteFile } from "@/lib/mini-apps";

interface RouteParams { params: Promise<{ id: string; path: string[] }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id, path } = await params;
  const filePath = path.join("/");

  const result = await readFile(id, filePath);
  if (!result) return errorResponse("File not found", 404);

  return new NextResponse(result.content, {
    headers: { "Content-Type": result.contentType },
  });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id, path } = await params;
  const filePath = path.join("/");

  const deleted = await deleteFile(id, filePath);
  if (!deleted) return errorResponse("File not found", 404);

  return NextResponse.json({ success: true });
}
