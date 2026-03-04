import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, AUTH_SESSION_EXPIRED_EVENT } from "./client";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock window.dispatchEvent
const mockDispatchEvent = vi.fn();
vi.stubGlobal("window", { dispatchEvent: mockDispatchEvent });

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status: number) {
  return new Response(text, { status });
}

describe("ApiClient", () => {
  let api: ApiClient;

  beforeEach(() => {
    api = new ApiClient("http://test/api/v1");
    mockFetch.mockReset();
    mockDispatchEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Successful requests ----

  it("makes a GET request with credentials", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

    const result = await api.get("/users");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://test/api/v1/users",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    expect(result).toEqual({ id: 1 });
  });

  it("makes a POST request with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 2 }));

    const result = await api.post("/users", { name: "test" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://test/api/v1/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      }),
    );
    expect(result).toEqual({ id: 2 });
  });

  it("handles 204 No Content", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await api.delete("/users/1");

    expect(result).toBeUndefined();
  });

  it("handles zero content-length", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 200,
        headers: { "content-length": "0" },
      }),
    );

    const result = await api.get("/empty");
    expect(result).toBeUndefined();
  });

  // ---- Error handling ----

  it("throws ApiError on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Not Found", 404));

    const promise = api.get("/missing");
    await expect(promise).rejects.toThrow(ApiError);
  });

  it("ApiError contains the correct status code", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Not Found", 404));

    try {
      await api.get("/missing");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });

  // ---- 401 + Token refresh ----

  it("retries after successful token refresh on 401", async () => {
    // First call: 401
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    // Refresh call: success
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    // Retry call: success
    mockFetch.mockResolvedValueOnce(jsonResponse({ refreshed: true }));

    const result = await api.get("/protected");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ refreshed: true });
  });

  it("dispatches session-expired event when refresh fails", async () => {
    // First call: 401
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    // Refresh call: fails
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(api.get("/protected")).rejects.toThrow(ApiError);
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: AUTH_SESSION_EXPIRED_EVENT }),
    );
  });

  it("deduplicates concurrent refresh attempts", async () => {
    // Both calls get 401
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    // Single refresh call
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    // Both retry calls succeed
    mockFetch.mockResolvedValueOnce(jsonResponse({ a: 1 }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ b: 2 }));

    const [r1, r2] = await Promise.all([
      api.get("/a"),
      api.get("/b"),
    ]);

    expect(r1).toEqual({ a: 1 });
    expect(r2).toEqual({ b: 2 });
    // 2 original + 1 refresh (deduplicated) + 2 retries = 5
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  // ---- HTTP methods ----

  it("put sends PUT method", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }));

    await api.put("/resource/1", { data: true });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("patch sends PATCH method", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ patched: true }));

    await api.patch("/resource/1", { field: "value" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("delete sends DELETE method", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await api.delete("/resource/1");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("ApiError", () => {
  it("has status and body properties", () => {
    const err = new ApiError(422, '{"detail":"validation"}');
    expect(err.status).toBe(422);
    expect(err.body).toBe('{"detail":"validation"}');
    expect(err.message).toContain("422");
  });

  it("is an instance of Error", () => {
    const err = new ApiError(500, "Internal");
    expect(err).toBeInstanceOf(Error);
  });
});
