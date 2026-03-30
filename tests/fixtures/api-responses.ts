export const mockApiResponses = {
  // Success responses
  success: {
    status: 200,
    data: { message: "Success" },
  },

  // Error responses
  unauthorized: {
    status: 401,
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key",
    },
  },

  forbidden: {
    status: 403,
    error: {
      code: "FORBIDDEN",
      message: "Insufficient permissions",
    },
  },

  notFound: {
    status: 404,
    error: {
      code: "NOT_FOUND",
      message: "Resource not found",
    },
  },

  rateLimited: {
    status: 429,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests",
      retryAfter: 60,
    },
  },

  serverError: {
    status: 500,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  },

  // Paginated responses
  paginated: {
    status: 200,
    data: {
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 100,
        totalPages: 5,
      },
    },
  },

  // Stream responses
  streamEvent: {
    id: "event_123",
    event: "message",
    data: { message: "Hello, world!" },
    timestamp: "2024-01-01T00:00:00Z",
  },
};

export const mockHeaders = {
  "content-type": "application/json",
  authorization: "Bearer test_token",
  "x-request-id": "req_123",
};

export const mockNetworkError = new Error("Network error");
mockNetworkError.name = "NetworkError";

export const mockTimeoutError = new Error("Request timeout");
mockTimeoutError.name = "TimeoutError";
