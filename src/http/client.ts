import {
  ApiError,
  NetworkError,
  parseApiError,
  RateLimitError,
  TimeoutError,
} from "./errors.js";
import { parseSSEStream, type SSEEvent } from "./stream.js";

export interface ApiClientConfig {
  accessToken?: string;
  apiKey: string;
  authUrl?: string;
  baseUrl: string;
  debug?: boolean;
  headers?: Record<string, string>;
  onTokenRefresh?: (tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  }) => void;
  refreshToken?: string;
  timeout?: number;
  tokenExpiresAt?: number;
}

const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export class ApiClient {
  private readonly config: Required<
    Pick<ApiClientConfig, "apiKey" | "baseUrl" | "timeout" | "debug">
  > & {
    headers: Record<string, string>;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    authUrl?: string;
    onTokenRefresh?: ApiClientConfig["onTokenRefresh"];
  };

  constructor(config: ApiClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      debug: config.debug ?? false,
      headers: config.headers ?? {},
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      tokenExpiresAt: config.tokenExpiresAt,
      authUrl: config.authUrl,
      onTokenRefresh: config.onTokenRefresh,
    };
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>("GET", url);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("POST", url, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("PUT", url, body);
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("PATCH", url, body);
  }

  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path);
    await this.request<void>("DELETE", url);
  }

  async upload(
    path: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const url = this.buildUrl(path);
    const headers = this.baseHeaders();
    headers["Content-Type"] = contentType;
    headers["Content-Type"] = undefined;

    const response = await this.fetchWithTimeout(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": contentType },
      body: data,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }
  }

  async download(path: string): Promise<Blob> {
    const url = this.buildUrl(path);
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.baseHeaders(),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.blob();
  }

  async *stream(
    path: string,
    params?: Record<string, string>
  ): AsyncIterable<SSEEvent> {
    const url = this.buildUrl(path, params);
    const headers = this.baseHeaders();
    headers.Accept = "text/event-stream";

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    yield* parseSSEStream(response);
  }

  async *postStream(path: string, body?: unknown): AsyncIterable<SSEEvent> {
    const url = this.buildUrl(path);
    const headers = this.baseHeaders();
    headers.Accept = "text/event-stream";
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    yield* parseSSEStream(response);
  }

  async postFormData<T = unknown>(path: string, form: FormData): Promise<T> {
    const url = this.buildUrl(path);
    const headers = this.baseHeaders();
    // Don't set Content-Type — fetch sets it with boundary for FormData

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: form,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<T>;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  }

  private getAuthToken(): string {
    return this.config.accessToken ?? this.config.apiKey;
  }

  private baseHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getAuthToken()}`,
      "Content-Type": "application/json",
      ...this.config.headers,
    };
  }

  private async ensureFreshToken(): Promise<void> {
    if (
      !(
        this.config.accessToken &&
        this.config.refreshToken &&
        this.config.tokenExpiresAt &&
        this.config.authUrl
      )
    ) {
      return;
    }

    const now = Date.now() / 1000;
    if (now < this.config.tokenExpiresAt - 60) {
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "a0000000-0000-0000-0000-000000000001",
        refresh_token: this.config.refreshToken,
      });

      const response = await fetch(`${this.config.authUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      this.config.accessToken = data.access_token;
      if (data.refresh_token) {
        this.config.refreshToken = data.refresh_token;
      }
      this.config.tokenExpiresAt =
        Math.floor(Date.now() / 1000) + data.expires_in;

      this.config.onTokenRefresh?.({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: this.config.tokenExpiresAt,
      });
    } catch {
      // Refresh failed silently; the request will proceed with the current token
      // and may get a 401, which the caller should handle
    }
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown
  ): Promise<T> {
    let lastError: Error | undefined;

    await this.ensureFreshToken();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (this.config.debug) {
          console.error(`[debug] ${method} ${url}`);
        }

        const response = await this.fetchWithTimeout(url, {
          method,
          headers: this.baseHeaders(),
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        if (this.config.debug) {
          console.error(`[debug] ${response.status} ${response.statusText}`);
        }

        if (!response.ok) {
          const error = await this.parseError(response);

          if (this.shouldRetry(error, attempt)) {
            const delay = this.retryDelay(attempt, error);
            await sleep(delay);
            lastError = error;
            continue;
          }

          throw error;
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof ApiError) {
          throw err;
        }

        if (
          err instanceof TypeError &&
          (err.message.includes("fetch") || err.message.includes("network"))
        ) {
          lastError = new NetworkError(err.message);
          if (attempt < MAX_RETRIES) {
            await sleep(this.retryDelay(attempt));
            continue;
          }
          throw lastError;
        }

        throw err;
      }
    }

    throw lastError ?? new NetworkError("Request failed after retries");
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(
          `Request timed out after ${this.config.timeout}ms`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async parseError(response: Response): Promise<ApiError> {
    try {
      const body = await response.json();
      return parseApiError(response.status, body as Record<string, unknown>);
    } catch {
      return new ApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    throw await this.parseError(response);
  }

  private shouldRetry(error: ApiError, attempt: number): boolean {
    if (attempt >= MAX_RETRIES) {
      return false;
    }
    if (error instanceof RateLimitError) {
      return true;
    }
    if (error.statusCode >= 500) {
      return true;
    }
    return false;
  }

  private retryDelay(attempt: number, error?: ApiError): number {
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }
    return RETRY_BASE_DELAY * 2 ** attempt;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
