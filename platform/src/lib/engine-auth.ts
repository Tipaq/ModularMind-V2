import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

/**
 * Validate X-Engine-Key header and return the engine record.
 * Returns null + error response if invalid.
 */
export async function validateEngineKey(req: NextRequest) {
  const apiKey = req.headers.get("X-Engine-Key");
  if (!apiKey) {
    return {
      engine: null,
      error: NextResponse.json({ error: "Missing X-Engine-Key" }, { status: 401 }),
    };
  }

  const engine = await db.engine.findUnique({
    where: { apiKey },
    include: { client: true },
  });

  if (!engine) {
    return {
      engine: null,
      error: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    };
  }

  return { engine, error: null };
}
