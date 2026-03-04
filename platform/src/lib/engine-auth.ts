import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { errorResponse } from "./api-utils";

/**
 * Validate X-Engine-Key header and return the engine record.
 * Returns null + error response if invalid.
 */
export async function validateEngineKey(req: NextRequest) {
  const apiKey = req.headers.get("X-Engine-Key");
  if (!apiKey) {
    return {
      engine: null as null,
      error: errorResponse("Missing X-Engine-Key", 401),
    };
  }

  const engine = await db.engine.findUnique({
    where: { apiKey },
    include: { client: true },
  });

  if (!engine) {
    return {
      engine: null as null,
      error: errorResponse("Invalid API key", 401),
    };
  }

  return { engine, error: null as null };
}
