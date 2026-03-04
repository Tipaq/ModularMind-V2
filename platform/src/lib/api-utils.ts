import { NextResponse } from "next/server";
import { auth } from "./auth";

/**
 * Require an authenticated session. Returns the session or a 401 response.
 */
export async function requireAuth(): Promise<
  | { session: Awaited<ReturnType<typeof auth>>; error?: never }
  | { session?: never; error: NextResponse }
> {
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
