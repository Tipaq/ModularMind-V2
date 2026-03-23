export const AUTH_SESSION_EXPIRED_EVENT = "auth:session-expired";

const CONTENT_TYPE_JSON = "application/json";
const HTTP_NO_CONTENT = 204;
const EMPTY_CONTENT_LENGTH = "0";
const HTTP_UNAUTHORIZED = 401;

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type FormDataFactory = () => FormData;

function serializeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function isEmptyResponse(response: Response): boolean {
  return (
    response.status === HTTP_NO_CONTENT ||
    response.headers.get("content-length") === EMPTY_CONTENT_LENGTH
  );
}

async function parseJsonSafely<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, text);
  }
}

export class ApiClient {
  private baseUrl: string;
  private refreshing: Promise<boolean> | null = null;

  constructor(baseUrl: string = "/api/v1") {
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T | undefined> {
    const { method = "GET", body, headers = {}, signal } = options;
    const serializedBody = serializeBody(body);

    const buildFetchOptions = (): RequestInit => ({
      method,
      credentials: "include",
      headers: { "Content-Type": CONTENT_TYPE_JSON, ...headers },
      body: serializedBody,
      signal,
    });

    const response = await fetch(`${this.baseUrl}${path}`, buildFetchOptions());

    if (response.status === HTTP_UNAUTHORIZED) {
      const refreshed = await this.refresh();
      if (!refreshed) throw new ApiError(HTTP_UNAUTHORIZED, "Session expired");
      return this.handleResponse<T>(
        await fetch(`${this.baseUrl}${path}`, buildFetchOptions()),
      );
    }

    return this.handleResponse<T>(response);
  }

  async upload<T>(
    path: string,
    formDataOrFactory: FormData | FormDataFactory,
  ): Promise<T | undefined> {
    const buildFormData = typeof formDataOrFactory === "function"
      ? formDataOrFactory
      : (): FormData => {
          const cloned = new FormData();
          for (const [key, value] of formDataOrFactory.entries()) {
            cloned.append(key, value);
          }
          return cloned;
        };

    const buildFetchOptions = (): RequestInit => ({
      method: "POST",
      credentials: "include",
      body: buildFormData(),
    });

    const response = await fetch(`${this.baseUrl}${path}`, buildFetchOptions());

    if (response.status === HTTP_UNAUTHORIZED) {
      const refreshed = await this.refresh();
      if (!refreshed) throw new ApiError(HTTP_UNAUTHORIZED, "Session expired");
      return this.handleResponse<T>(
        await fetch(`${this.baseUrl}${path}`, buildFetchOptions()),
      );
    }

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T | undefined> {
    if (!response.ok) throw new ApiError(response.status, await response.text());
    if (isEmptyResponse(response)) return undefined;
    return parseJsonSafely<T>(response);
  }

  private async refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = fetch(`${this.baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).then((r) => {
      if (!r.ok) {
        window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
        return false;
      }
      return true;
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
