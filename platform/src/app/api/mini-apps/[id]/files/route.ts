import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { writeFile, listFiles } from "@/lib/mini-apps";
import { db } from "@/lib/db";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const files = await listFiles(id);
  return NextResponse.json(files);
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  if (!body.path || !body.content) {
    return errorResponse("path and content are required", 400);
  }

  const app = await db.miniApp.findUnique({ where: { id } });
  if (!app) return errorResponse("Mini-app not found", 404);

  try {
    const content = body.is_base64
      ? Buffer.from(body.content, "base64")
      : body.content;

    const result = await writeFile(id, body.path, content, body.content_type || "text/plain");

    await db.miniApp.update({ where: { id }, data: { version: { increment: 1 } } });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(`Failed to write file: ${e}`, 500);
  }
}
