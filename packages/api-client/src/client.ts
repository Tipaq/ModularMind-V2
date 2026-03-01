/**
 * Base HTTP client for Engine API.
 *
 * Features:
 * - HttpOnly cookie auth (no Authorization header)
 * - Automatic token refresh on 401
 * - Refresh mutex to prevent concurrent refresh requests
 */

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export class ApiClient {
  private baseUrl: string;
  private refreshing: Promise<void> | null = null;

  constructor(baseUrl: string = "/api/v1") {
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {}, signal } = options;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (response.status === 401) {
      await this.refresh();
      // Retry once after refresh
      const retry = await fetch(`${this.baseUrl}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
      if (!retry.ok) throw new ApiError(retry.status, await retry.text());
      return retry.json();
    }

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = fetch(`${this.baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).then((r) => {
      if (!r.ok) {
        window.location.href = "/login";
      }
    }).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  get<T>(path: string, signal?: AbortSignal) {
    return this.request<T>(path, { signal });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "POST", body });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PUT", body });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PATCH", body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API Error ${status}: ${body}`);
  }
}
