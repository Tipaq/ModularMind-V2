import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrEngineKey, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const app = await db.miniApp.findUnique({
    where: { id },
    include: { files: { select: { path: true, sizeBytes: true, contentType: true } } },
  });

  if (!app) return errorResponse("Mini-app not found", 404);
  return NextResponse.json(app);
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const app = await db.miniApp.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.scope !== undefined && { scope: body.scope }),
      ...(body.allowedGroups !== undefined && { allowedGroups: body.allowedGroups }),
    },
  });

  return NextResponse.json(app);
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { error } = await requireAuthOrEngineKey(req);
  if (error) return error;

  const { id } = await params;
  await db.miniApp.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
