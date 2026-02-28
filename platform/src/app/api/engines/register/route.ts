import { NextRequest, NextResponse } from "next/server";
import { validateEngineKey } from "@/lib/engine-auth";
import { db } from "@/lib/db";

// POST /api/engines/register — Engine registers itself on startup
export async function POST(req: NextRequest) {
  const { engine, error } = await validateEngineKey(req);
  if (error) return error;

  const body = await req.json();

  await db.engine.update({
    where: { id: engine.id },
    data: {
      lastSeen: new Date(),
      status: "registered",
      ...(body.url && { url: body.url }),
      ...(body.version !== undefined && { version: body.version }),
    },
  });

  return NextResponse.json({ ok: true, engine_id: engine.id });
}
