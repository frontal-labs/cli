import { CliError, docsUrlFor } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { redact, redactString } from "@/output/redact.js";
import { theme } from "@/output/theme.js";

export interface ErrorReport {
  code: string;
  docs: string;
  exitCode: number;
  fields?: { field: string; message: string }[];
  fix?: string;
  message: string;
  requestId?: string;
  retryAfter?: number;
  statusCode?: number;
}

interface ApiErrorShape {
  code?: unknown;
  docs?: unknown;
  fields?: unknown;
  message?: unknown;
  name?: unknown;
  requestId?: unknown;
  retryAfter?: unknown;
  statusCode?: unknown;
}

const RETRY_HINT = "Wait and try again.";

const FIX_BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Run `frontal auth login` or set a valid FRONTAL_API_KEY.",
  INVALID_API_KEY:
    "Check FRONTAL_API_KEY — it must be a valid key starting with frt_.",
  FORBIDDEN: "Check your role with `frontal auth whoami` or ask an admin.",
  NOT_FOUND: "Verify the resource id belongs to this workspace/environment.",
  VALIDATION_ERROR: "Fix the request payload; see the listed fields.",
  RATE_LIMITED: "Back off and retry, or lower request concurrency.",
  CONFLICT: "The resource changed underneath you; re-fetch and retry.",
};

function asApiError(err: unknown): ApiErrorShape | undefined {
  if (err instanceof Error && typeof (err as ApiErrorShape).code === "string") {
    return err as ApiErrorShape;
  }
  return;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function exitCodeForApiError(name: string, statusCode?: number): number {
  switch (name) {
    case "UnauthorizedError":
      return EXIT_CODES.AUTH_ERROR;
    case "ForbiddenError":
      return EXIT_CODES.PERMISSION_ERROR;
    case "NotFoundError":
      return EXIT_CODES.NOT_FOUND;
    case "ValidationError":
      return EXIT_CODES.VALIDATION_ERROR;
    case "RateLimitError":
      return EXIT_CODES.RATE_LIMITED;
    default:
      break;
  }
  if (statusCode === 401) {
    return EXIT_CODES.AUTH_ERROR;
  }
  if (statusCode === 403) {
    return EXIT_CODES.PERMISSION_ERROR;
  }
  if (statusCode === 404) {
    return EXIT_CODES.NOT_FOUND;
  }
  return EXIT_CODES.GENERAL_ERROR;
}

function fieldsFrom(value: unknown): ErrorReport["fields"] {
  if (!Array.isArray(value)) {
    return;
  }
  const fields: { field: string; message: string }[] = [];
  for (const item of value) {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      fields.push({
        field: String(record.field ?? record.path ?? ""),
        message: String(record.message ?? ""),
      });
    }
  }
  return fields.length > 0 ? fields : undefined;
}

function classifyApiError(err: ApiErrorShape): ErrorReport {
  const name = String(err.name ?? "");
  const code = String(err.code);
  const statusCode = optionalNumber(err.statusCode);
  const retryAfter = optionalNumber(err.retryAfter);

  let fix = FIX_BY_CODE[code];
  if (!fix && name === "RateLimitError") {
    fix = retryAfter ? `Wait ${retryAfter}s and try again.` : RETRY_HINT;
  }
  if (!fix && statusCode !== undefined && statusCode >= 500) {
    fix = "The Frontal API returned a server error. Retry shortly.";
  }

  return {
    code,
    message: String(err.message ?? "Request failed."),
    statusCode,
    requestId: optionalString(err.requestId),
    docs: optionalString(err.docs) ?? docsUrlFor(code),
    fix,
    fields: fieldsFrom(err.fields),
    retryAfter,
    exitCode: exitCodeForApiError(name, statusCode),
  };
}

function classifyZodError(err: Error): ErrorReport {
  const issues = (err as { issues?: unknown }).issues;
  return {
    code: "VALIDATION_ERROR",
    message: "Input validation failed.",
    fields: Array.isArray(issues)
      ? issues.map((issue) => ({
          field: Array.isArray(issue.path) ? issue.path.join(".") : "",
          message: String(issue.message ?? ""),
        }))
      : undefined,
    fix: FIX_BY_CODE.VALIDATION_ERROR,
    docs: docsUrlFor("VALIDATION_ERROR"),
    exitCode: EXIT_CODES.VALIDATION_ERROR,
  };
}

export function classifyError(
  err: unknown,
  context: { requestId?: string } = {}
): ErrorReport {
  if (err instanceof CliError) {
    return {
      code: err.code,
      message: err.message,
      fix: err.fix,
      docs: err.docs,
      requestId: err.requestId ?? context.requestId,
      exitCode: err.exitCode,
    };
  }

  if (err instanceof Error && err.name === "ZodError") {
    return classifyZodError(err);
  }

  if (err instanceof Error && err.name === "NetworkError") {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Frontal API.",
      fix: "Check your connection and the API URL (`frontal config list`).",
      docs: docsUrlFor("NETWORK_ERROR"),
      requestId: context.requestId,
      exitCode: EXIT_CODES.NETWORK_ERROR,
    };
  }

  if (err instanceof Error && err.name === "TimeoutError") {
    return {
      code: "TIMEOUT",
      message: err.message,
      fix: "Try again; the API did not respond in time.",
      docs: docsUrlFor("TIMEOUT"),
      requestId: context.requestId,
      exitCode: EXIT_CODES.TIMEOUT_ERROR,
    };
  }

  const apiError = asApiError(err);
  if (apiError) {
    const report = classifyApiError(apiError);
    return { ...report, requestId: report.requestId ?? context.requestId };
  }

  if (err instanceof Error) {
    return {
      code: "UNHANDLED_ERROR",
      message: err.message,
      docs: docsUrlFor("UNHANDLED_ERROR"),
      requestId: context.requestId,
      exitCode: EXIT_CODES.GENERAL_ERROR,
    };
  }

  return {
    code: "UNEXPECTED_ERROR",
    message: "An unexpected error occurred.",
    docs: docsUrlFor("UNEXPECTED_ERROR"),
    requestId: context.requestId,
    exitCode: EXIT_CODES.GENERAL_ERROR,
  };
}

export interface HandleErrorOptions {
  /** Request id captured by the SDK transport, when the error has none. */
  requestId?: string;
}

/**
 * Prints an error (human or `--json`) and exits with a stable exit code.
 * Every report carries `code`, `message`, `fix`, `docs` and `requestId`.
 */
export function handleError(
  err: unknown,
  globalOpts?: Record<string, unknown>,
  options: HandleErrorOptions = {}
): never {
  const report = renderError(err, globalOpts, options);
  process.exit(report.exitCode);
}

export function renderError(
  err: unknown,
  globalOpts?: Record<string, unknown>,
  options: HandleErrorOptions = {}
): ErrorReport {
  const debug = Boolean(globalOpts?.debug);
  const json = Boolean(globalOpts?.json);
  const report = classifyError(err, { requestId: options.requestId });

  if (json) {
    console.error(
      JSON.stringify({
        error: redact({
          code: report.code,
          message: report.message,
          fix: report.fix,
          docs: report.docs,
          requestId: report.requestId,
          statusCode: report.statusCode,
          fields: report.fields,
          retryAfter: report.retryAfter,
        }),
      })
    );
    return report;
  }

  console.error(theme.error(`${report.code}: ${redactString(report.message)}`));
  for (const field of report.fields ?? []) {
    console.error(theme.error(`  - ${field.field}: ${field.message}`));
  }
  if (report.fix) {
    console.error(theme.dim(`Fix:  ${report.fix}`));
  }
  console.error(theme.dim(`Docs: ${report.docs}`));
  if (report.requestId) {
    console.error(theme.dim(`Request ID: ${report.requestId}`));
  }

  if (debug && err instanceof Error) {
    console.error();
    if (report.statusCode !== undefined) {
      console.error(theme.dim(`Status Code: ${report.statusCode}`));
    }
    console.error(theme.dim(redactString(err.stack ?? "")));
  }

  return report;
}
