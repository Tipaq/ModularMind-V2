/**
 * Engine proxy helper.
 *
 * Forwards authenticated requests from Platform API routes to the Engine API.
 * Uses HMAC-SHA256 derived from ENGINE_SECRET_KEY for service-to-service auth.
 *
 * The Engine's `get_current_user` dependency accepts this HMAC token as a
 * valid Bearer credential, returning a synthetic OWNER-level service user.
 */

import { createHmac } from "crypto";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";
const ENGINE_SECRET_KEY = process.env.ENGINE_SECRET_KEY || "";

/**
 * Derive the internal service token using HMAC-SHA256.
 *
 * Must match the Engine's `_derive_internal_token(secret_key)` in
 * `engine/server/src/auth/dependencies.py` and `internal/auth.py`.
 */
function deriveInternalToken(secretKey: string): string {
  return createHmac("sha256", secretKey)
    .update("internal-service-token")
    .digest("hex");
}

/** Cached token — derived once at startup. */
const INTERNAL_TOKEN = ENGINE_SECRET_KEY
  ? deriveInternalToken(ENGINE_SECRET_KEY)
  : "";

interface EngineRequestInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
}

/**
 * Fetch from the Engine API with internal service auth.
 *
 * Injects `Authorization: Bearer <HMAC-token>` derived from ENGINE_SECRET_KEY.
 * The Engine validates this token via constant-time HMAC comparison and
 * returns a synthetic OWNER-level service user.
 *
 * @param path - API path (e.g. "/api/v1/conversations")
 * @param init - Fetch options (method, body, headers)
 * @returns Raw fetch Response from the Engine
 */
export async function engineFetch(
  path: string,
  init: EngineRequestInit = {},
  userEmail?: string,
): Promise<Response> {
  const url = `${ENGINE_URL}${path}`;

  const headers: Record<string, string> = {
    ...init.headers,
  };

  if (INTERNAL_TOKEN) {
    headers["Authorization"] = `Bearer ${INTERNAL_TOKEN}`;
  }

  // Forward the real Platform user email so the Engine can resolve
  // the actual user_id (instead of using the "platform-service" user).
  if (userEmail) {
    headers["X-Platform-User-Email"] = userEmail;
  }

  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    ...init,
    headers,
  });
}
