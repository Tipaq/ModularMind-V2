import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, AUTH_SESSION_EXPIRED_EVENT } from "./client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

  it("throws ApiError on malformed JSON response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("not-json{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(api.get("/bad-json")).rejects.toThrow(ApiError);
  });

  it("does not double-stringify a string body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await api.request("/raw", { method: "POST", body: '{"pre":"stringified"}' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: '{"pre":"stringified"}' }),
    );
  });

  it("retries after successful token refresh on 401", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ refreshed: true }));

    const result = await api.get("/protected");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ refreshed: true });
  });

  it("dispatches session-expired event when refresh fails", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(api.get("/protected")).rejects.toThrow(ApiError);
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: AUTH_SESSION_EXPIRED_EVENT }),
    );
  });

  it("deduplicates concurrent refresh attempts", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ a: 1 }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ b: 2 }));

    const [r1, r2] = await Promise.all([
      api.get("/a"),
      api.get("/b"),
    ]);

    expect(r1).toEqual({ a: 1 });
    expect(r2).toEqual({ b: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

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

describe("ApiClient.upload", () => {
  let api: ApiClient;

  beforeEach(() => {
    api = new ApiClient("http://test/api/v1");
    mockFetch.mockReset();
    mockDispatchEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads FormData with POST", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ uploaded: true }));

    const formData = new FormData();
    formData.append("file", "content");

    const result = await api.upload("/upload", formData);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://test/api/v1/upload",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(result).toEqual({ uploaded: true });
  });

  it("retries upload with cloned FormData on 401", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ retried: true }));

    const formData = new FormData();
    formData.append("file", "content");

    const result = await api.upload("/upload", formData);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ retried: true });
  });

  it("accepts a factory function for FormData", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("Unauthorized", 401));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ factory: true }));

    let callCount = 0;
    const factory = () => {
      callCount++;
      const fd = new FormData();
      fd.append("file", "content");
      return fd;
    };

    const result = await api.upload("/upload", factory);

    expect(result).toEqual({ factory: true });
    expect(callCount).toBe(2);
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
