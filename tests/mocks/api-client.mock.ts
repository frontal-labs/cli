import { vi } from "vitest";
import type { ApiClient } from "../../src/http/client.js";

// Mock ApiClient class
export const createMockApiClient = (overrides: Partial<ApiClient> = {}) => {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    stream: vi.fn(),
    postStream: vi.fn(),
    postFormData: vi.fn(),
    ...overrides,
  } as any;
};

// Mock API responses
export const mockApiSuccess = (data: any) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
  blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
});

export const mockApiError = (status: number, error: any) => ({
  ok: false,
  status,
  json: () => Promise.resolve(error),
  text: () => Promise.resolve(JSON.stringify(error)),
});

export const mockApiNotFound = () =>
  mockApiError(404, {
    code: "NOT_FOUND",
    message: "Resource not found",
  });

export const mockApiUnauthorized = () =>
  mockApiError(401, {
    code: "UNAUTHORIZED",
    message: "Invalid or missing API key",
  });

export const mockApiForbidden = () =>
  mockApiError(403, {
    code: "FORBIDDEN",
    message: "Insufficient permissions",
  });

export const mockApiRateLimited = (retryAfter = 60) =>
  mockApiError(429, {
    code: "RATE_LIMITED",
    message: "Too many requests",
    retryAfter,
  });

export const mockApiServerError = () =>
  mockApiError(500, {
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  });

// Mock streaming responses
export const createMockStreamResponse = (events: any[]) => {
  let eventIndex = 0;

  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          if (eventIndex >= events.length) {
            return Promise.resolve({ done: true });
          }
          const event = events[eventIndex++];
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(
              `id: ${event.id || `event_${eventIndex}`}\nevent: ${event.event || "message"}\ndata: ${JSON.stringify(event.data || event)}\n\n`
            ),
          });
        },
      }),
    },
  };
};

// Mock paginated responses
export const mockPaginatedResponse = (
  items: any[],
  page = 1,
  limit = 20,
  total?: number
) => ({
  items,
  pagination: {
    page,
    limit,
    total: total ?? items.length,
    totalPages: Math.ceil((total ?? items.length) / limit),
  },
});

// Mock network errors
export const mockNetworkError = new Error("Network error");
mockNetworkError.name = "NetworkError";

export const mockTimeoutError = new Error("Request timeout");
mockTimeoutError.name = "TimeoutError";

// Mock fetch with different scenarios
export const mockFetchWithResponses = (
  responses: Array<{ url: string; response: any }>
) => {
  const mockFetch = vi.fn((url: string, _options?: RequestInit) => {
    const match = responses.find((r) => url.includes(r.url));
    if (match) {
      return Promise.resolve(match.response);
    }
    return Promise.resolve(mockApiNotFound());
  });

  global.fetch = mockFetch as any;
  return mockFetch;
};

// Mock sequential responses (for retry testing)
export const mockFetchWithSequence = (responses: any[]) => {
  let index = 0;
  const mockFetch = vi.fn(() => {
    const response = responses[index % responses.length];
    index++;
    return Promise.resolve(response);
  });

  global.fetch = mockFetch as any;
  return mockFetch;
};

// Mock delayed responses
export const mockFetchWithDelay = (response: any, delay: number) => {
  const mockFetch = vi.fn(
    () => new Promise((resolve) => setTimeout(() => resolve(response), delay))
  );

  global.fetch = mockFetch as any;
  return mockFetch;
};
