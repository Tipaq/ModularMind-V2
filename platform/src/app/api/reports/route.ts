import { NextRequest, NextResponse } from "next/server";
import { validateEngineKey } from "@/lib/engine-auth";
import { parseBody, reportSchema } from "@/lib/validations";
import { db } from "@/lib/db";

// POST /api/reports — Engine posts metrics periodically
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { engine, error } = await validateEngineKey(req);
  if (error) return error;

  const { data, error: validationError } = await parseBody(req, reportSchema);
  if (validationError) return validationError;

  await db.engine.update({
    where: { id: engine.id },
    data: {
      lastSeen: new Date(),
      status: data.status.health === "ok" ? "synced" : "error",
    },
  });

  return NextResponse.json({ ok: true });
}
