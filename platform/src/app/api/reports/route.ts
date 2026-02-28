import { NextRequest, NextResponse } from "next/server";
import { validateEngineKey } from "@/lib/engine-auth";

// POST /api/reports — Engine posts metrics periodically
export async function POST(req: NextRequest) {
  const { engine, error } = await validateEngineKey(req);
  if (error) return error;

  const body = await req.json();

  // For now, just log that we received the report
  // Future: store in a metrics table or time-series DB
  console.log(
    `[report] Engine ${engine.name} (${engine.id}): status=${body.status?.health}, models=${body.models?.length ?? 0}`
  );

  return NextResponse.json({ ok: true });
}
