import type { Session } from "next-auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { checkRateLimit } from "./rate-limit";

/**
 * Require an authenticated session with rate limiting.
 * Returns the session or a 401/429 response.
 */
export async function requireAuth(opts?: {
  maxRequests?: number;
  windowMs?: number;
}): Promise<
  | { session: Session; error?: never }
  | { session?: never; error: NextResponse }
> {
  // Rate limit by IP
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimited = checkRateLimit(ip, opts?.maxRequests, opts?.windowMs);
  if (rateLimited) return { error: rateLimited };

  const session = await auth();
  if (!session) {
    return { error: errorResponse("Unauthorized", 401) };
  }
  return { session };
}

/**
 * Build a standardized JSON error response.
 */
export function errorResponse(
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  const body: Record<string, unknown> = { error: message };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}
