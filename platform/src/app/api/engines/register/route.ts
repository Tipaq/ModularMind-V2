import { NextRequest, NextResponse } from "next/server";
import { validateEngineKey } from "@/lib/engine-auth";
import { db } from "@/lib/db";
import { engineRegisterSchema, parseBody } from "@/lib/validations";

// POST /api/engines/register — Engine registers itself on startup
export async function POST(req: NextRequest) {
  const { engine, error } = await validateEngineKey(req);
  if (error) return error;

  const { data, error: bodyError } = await parseBody(req, engineRegisterSchema);
  if (bodyError) return bodyError;

  await db.engine.update({
    where: { id: engine.id },
    data: {
      lastSeen: new Date(),
      status: "registered",
      ...(data.url && { url: data.url }),
      ...(data.version !== undefined && { version: data.version }),
    },
  });

  return NextResponse.json({ ok: true, engine_id: engine.id });
}
