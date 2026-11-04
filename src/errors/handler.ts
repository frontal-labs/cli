import { CliError, docsUrlFor } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { isJsonRecord, jsonField, jsonFlag } from "@/lib/json.js";
import { redact, redactString } from "@/output/redact.js";
import { theme } from "@/output/theme.js";

export interface ErrorReport {
  code: string;
  docs: string;
  exitCode: number;
  fields?: { field: string; message: string }[] | undefined;
  fix?: string | undefined;
  message: string;
  requestId?: string | undefined;
  retryAfter?: number | undefined;
  statusCode?: number | undefined;
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
  CONFLICT: "The resource changed underneath you; re-fetch and retry.",
  FORBIDDEN: "Check your role with `frontal auth whoami` or ask an admin.",
  INVALID_API_KEY:
    "Check FRONTAL_API_KEY — it must be a valid key starting with frt_.",
  NOT_FOUND: "Verify the resource id belongs to this workspace/environment.",
  RATE_LIMITED: "Back off and retry, or lower request concurrency.",
  UNAUTHORIZED: "Run `frontal auth login` or set a valid FRONTAL_API_KEY.",
  VALIDATION_ERROR: "Fix the request payload; see the listed fields.",
};

function asApiError(err: unknown): ApiErrorShape | undefined {
  if (err instanceof Error && "code" in err && typeof err.code === "string") {
    return err;
  }
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
  for (const item of value.filter(isJsonRecord)) {
    fields.push({
      field: String(jsonField(item, "field") ?? jsonField(item, "path") ?? ""),
      message: String(jsonField(item, "message") ?? ""),
    });
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
    docs: optionalString(err.docs) ?? docsUrlFor(code),
    exitCode: exitCodeForApiError(name, statusCode),
    fields: fieldsFrom(err.fields),
    fix,
    message: String(err.message ?? "Request failed."),
    requestId: optionalString(err.requestId),
    retryAfter,
    statusCode,
  };
}

/** The fix hint for an error code, if the table has one. */
function fixFor(code: string): string | undefined {
  return FIX_BY_CODE[code];
}

function classifyZodError(err: Error): ErrorReport {
  const issues: unknown = "issues" in err ? err.issues : undefined;
  return {
    code: "VALIDATION_ERROR",
    docs: docsUrlFor("VALIDATION_ERROR"),
    exitCode: EXIT_CODES.VALIDATION_ERROR,
    fields: Array.isArray(issues)
      ? issues.filter(isJsonRecord).map((issue) => {
          const path = jsonField(issue, "path");
          return {
            field: Array.isArray(path) ? path.join(".") : "",
            message: String(jsonField(issue, "message") ?? ""),
          };
        })
      : undefined,
    fix: fixFor("VALIDATION_ERROR"),
    message: "Input validation failed.",
  };
}

export function classifyError(
  err: unknown,
  context: { requestId?: string | undefined } = {}
): ErrorReport {
  if (err instanceof CliError) {
    return {
      code: err.code,
      docs: err.docs,
      exitCode: err.exitCode,
      fix: err.fix,
      message: err.message,
      requestId: err.requestId ?? context.requestId,
    };
  }

  if (err instanceof Error && err.name === "ZodError") {
    return classifyZodError(err);
  }

  if (err instanceof Error && err.name === "NetworkError") {
    return {
      code: "NETWORK_ERROR",
      docs: docsUrlFor("NETWORK_ERROR"),
      exitCode: EXIT_CODES.NETWORK_ERROR,
      fix: "Check your connection and the API URL (`frontal config list`).",
      message: "Could not reach the Frontal API.",
      requestId: context.requestId,
    };
  }

  if (err instanceof Error && err.name === "TimeoutError") {
    return {
      code: "TIMEOUT",
      docs: docsUrlFor("TIMEOUT"),
      exitCode: EXIT_CODES.TIMEOUT_ERROR,
      fix: "Try again; the API did not respond in time.",
      message: err.message,
      requestId: context.requestId,
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
      docs: docsUrlFor("UNHANDLED_ERROR"),
      exitCode: EXIT_CODES.GENERAL_ERROR,
      message: err.message,
      requestId: context.requestId,
    };
  }

  return {
    code: "UNEXPECTED_ERROR",
    docs: docsUrlFor("UNEXPECTED_ERROR"),
    exitCode: EXIT_CODES.GENERAL_ERROR,
    message: "An unexpected error occurred.",
    requestId: context.requestId,
  };
}

export interface HandleErrorOptions {
  /** Request id captured by the SDK transport, when the error has none. */
  requestId?: string | undefined;
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
  const debug = globalOpts !== undefined && jsonFlag(globalOpts, "debug");
  const json = globalOpts !== undefined && jsonFlag(globalOpts, "json");
  const report = classifyError(err, { requestId: options.requestId });

  if (json) {
    console.error(
      JSON.stringify({
        error: redact({
          code: report.code,
          docs: report.docs,
          fields: report.fields,
          fix: report.fix,
          message: report.message,
          requestId: report.requestId,
          retryAfter: report.retryAfter,
          statusCode: report.statusCode,
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
