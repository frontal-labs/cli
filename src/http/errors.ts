export class ApiError extends Error {
  code: string;
  statusCode: number;
  requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code = "unknown_error",
    requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found", requestId?: string) {
    super(message, 404, "not_found", requestId);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", requestId?: string) {
    super(message, 401, "unauthorized", requestId);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", requestId?: string) {
    super(message, 403, "forbidden", requestId);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends ApiError {
  fields?: Array<{ field: string; message: string }>;

  constructor(
    message = "Validation failed",
    fields?: Array<{ field: string; message: string }>,
    requestId?: string
  ) {
    super(message, 422, "validation_error", requestId);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class RateLimitError extends ApiError {
  retryAfter?: number;

  constructor(
    message = "Rate limit exceeded",
    retryAfter?: number,
    requestId?: string
  ) {
    super(message, 429, "rate_limit", requestId);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict", requestId?: string) {
    super(message, 409, "conflict", requestId);
    this.name = "ConflictError";
  }
}

export class NetworkError extends ApiError {
  constructor(message = "Network error") {
    super(message, 0, "network_error");
    this.name = "NetworkError";
  }
}

export class TimeoutError extends ApiError {
  constructor(message = "Request timed out") {
    super(message, 0, "timeout");
    this.name = "TimeoutError";
  }
}

export function parseApiError(
  statusCode: number,
  body: {
    code?: string;
    message?: string;
    requestId?: string;
    errors?: Array<{ field: string; message: string }>;
  }
): ApiError {
  const msg = body.message ?? `HTTP ${statusCode}`;
  const rid = body.requestId;

  switch (statusCode) {
    case 401:
      return new UnauthorizedError(msg, rid);
    case 403:
      return new ForbiddenError(msg, rid);
    case 404:
      return new NotFoundError(msg, rid);
    case 409:
      return new ConflictError(msg, rid);
    case 422:
      return new ValidationError(msg, body.errors, rid);
    case 429: {
      const err = new RateLimitError(msg, undefined, rid);
      return err;
    }
    default:
      return new ApiError(msg, statusCode, body.code ?? "server_error", rid);
  }
}
