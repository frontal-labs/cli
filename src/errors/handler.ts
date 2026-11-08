import { isFrontalError } from "@frontal-labs/error";
import {
  type ErrorFormat,
  type FrameSection,
  fix as fixSection,
  frame,
  link as linkSection,
} from "@frontal-labs/error/format";
import { CliError, docsUrlFor } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { isJsonRecord, jsonField, jsonFlag } from "@/lib/json.js";
import { redact, redactString } from "@/output/redact.js";

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
  fix?: unknown;
  link?: unknown;
  message?: unknown;
  name?: unknown;
  requestId?: unknown;
  retryAfter?: unknown;
  statusCode?: unknown;
}

const RETRY_HINT = "Wait and try again.";
const VALIDATION_FIX = "Fix the request payload; see the listed fields.";

const FIX_BY_CODE: Record<string, string> = {
  CONFLICT: "The resource changed underneath you; re-fetch and retry.",
  FORBIDDEN: "Check your role with `frontal auth whoami` or ask an admin.",
  INVALID_API_KEY:
    "Check FRONTAL_API_KEY — it must be a valid key starting with frt_.",
  NOT_FOUND: "Verify the resource id belongs to this workspace/environment.",
  RATE_LIMITED: "Back off and retry, or lower request concurrency.",
  UNAUTHORIZED: "Run `frontal auth login` or set a valid FRONTAL_API_KEY.",
  VALIDATION_ERROR: VALIDATION_FIX,
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

/** Exit codes for tagged `FrontalError`s, keyed by the stable error code. */
const EXIT_CODE_BY_CODE: Record<string, number> = {
  CONFIG_INVALID: EXIT_CODES.CONFIG_ERROR,
  FORBIDDEN: EXIT_CODES.PERMISSION_ERROR,
  INVALID_API_KEY: EXIT_CODES.AUTH_ERROR,
  NETWORK_ERROR: EXIT_CODES.NETWORK_ERROR,
  NO_CREDENTIALS: EXIT_CODES.AUTH_ERROR,
  NO_PROJECT: EXIT_CODES.CONFIG_ERROR,
  NOT_FOUND: EXIT_CODES.NOT_FOUND,
  RATE_LIMITED: EXIT_CODES.RATE_LIMITED,
  TIMEOUT: EXIT_CODES.TIMEOUT_ERROR,
  TOKEN_EXPIRED: EXIT_CODES.AUTH_ERROR,
  UNAUTHORIZED: EXIT_CODES.AUTH_ERROR,
  VALIDATION_ERROR: EXIT_CODES.VALIDATION_ERROR,
};

/** Exit codes for SDK error classes, keyed by `error.name` (pre-library SDKs). */
const EXIT_CODE_BY_SDK_NAME: Record<string, number> = {
  ForbiddenError: EXIT_CODES.PERMISSION_ERROR,
  NotFoundError: EXIT_CODES.NOT_FOUND,
  RateLimitError: EXIT_CODES.RATE_LIMITED,
  UnauthorizedError: EXIT_CODES.AUTH_ERROR,
  ValidationError: EXIT_CODES.VALIDATION_ERROR,
};

/** Shared HTTP status fallback. 429 is handled by callers that need it. */
function exitCodeForStatus(statusCode?: number): number {
  switch (statusCode) {
    case 401:
      return EXIT_CODES.AUTH_ERROR;
    case 403:
      return EXIT_CODES.PERMISSION_ERROR;
    case 404:
      return EXIT_CODES.NOT_FOUND;
    default:
      return EXIT_CODES.GENERAL_ERROR;
  }
}

/** Tagged errors: stable code first, then status (429 included). */
function exitCodeForTaggedError(code: string, statusCode?: number): number {
  return (
    EXIT_CODE_BY_CODE[code] ??
    (statusCode === 429
      ? EXIT_CODES.RATE_LIMITED
      : exitCodeForStatus(statusCode))
  );
}

/** Untagged SDK errors: class name first, then status (no 429 mapping). */
function exitCodeForSdkError(name: string, statusCode?: number): number {
  return EXIT_CODE_BY_SDK_NAME[name] ?? exitCodeForStatus(statusCode);
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

/** Builds a report from an error's public fields; the exit code is resolved by the caller. */
function reportFromErrorFields(
  err: ApiErrorShape,
  exitCode: number
): ErrorReport {
  const code = String(err.code);
  const statusCode = optionalNumber(err.statusCode);
  const retryAfter = optionalNumber(err.retryAfter);

  // Precedence: CLI wording, then the generic 5xx and rate-limit hints (these
  // keep `--json` output byte-identical for SDK errors), then the error's own
  // fix. The SDK's ServiceError carries its own fix, so it must come last.
  let fix: string | undefined = FIX_BY_CODE[code];
  if (!fix && exitCode === EXIT_CODES.RATE_LIMITED) {
    fix = retryAfter ? `Wait ${retryAfter}s and try again.` : RETRY_HINT;
  }
  if (!fix && statusCode !== undefined && statusCode >= 500) {
    fix = "The Frontal API returned a server error. Retry shortly.";
  }
  fix ??= optionalString(err.fix);

  return {
    code,
    docs:
      optionalString(err.docs) ?? optionalString(err.link) ?? docsUrlFor(code),
    exitCode,
    fields: fieldsFrom(err.fields),
    fix,
    message: String(err.message ?? "Request failed."),
    requestId: optionalString(err.requestId),
    retryAfter,
    statusCode,
  };
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
    fix: VALIDATION_FIX,
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

  if (isFrontalError(err)) {
    const report = reportFromErrorFields(
      err,
      exitCodeForTaggedError(String(err.code), optionalNumber(err.statusCode))
    );
    return { ...report, requestId: report.requestId ?? context.requestId };
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
    const report = reportFromErrorFields(
      apiError,
      exitCodeForSdkError(
        String(apiError.name ?? ""),
        optionalNumber(apiError.statusCode)
      )
    );
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
    console.error(JSON.stringify({ error: redact(jsonEnvelope(report)) }));
    return report;
  }

  console.error(
    formatHumanError(
      report,
      debugLines(err, report, debug),
      errorFormat(globalOpts)
    )
  );
  return report;
}

/**
 * `auto` checks stdout for a TTY, but the error goes to stderr, so only a TTY
 * stderr may colour it. `--no-color` always wins.
 */
function errorFormat(globalOpts?: Record<string, unknown>): ErrorFormat {
  const colorDisabled =
    globalOpts !== undefined && jsonField(globalOpts, "color") === false;
  return colorDisabled || !process.stderr.isTTY ? "plain" : "auto";
}

/** The `--json` error body. Key order is part of the public contract. */
function jsonEnvelope(report: ErrorReport): Record<string, unknown> {
  return {
    code: report.code,
    docs: report.docs,
    fields: report.fields,
    fix: report.fix,
    message: report.message,
    requestId: report.requestId,
    retryAfter: report.retryAfter,
    statusCode: report.statusCode,
  };
}

/** Extra `--debug` lines: status code and stack trace, already redacted. */
function debugLines(
  err: unknown,
  report: ErrorReport,
  debug: boolean
): string[] {
  if (!(debug && err instanceof Error)) {
    return [];
  }
  const lines =
    report.statusCode === undefined
      ? []
      : [`Status Code: ${report.statusCode}`];
  return [...lines, ...redactString(err.stack ?? "").split("\n")];
}

/** Human output: one frame, sanitised by the library and redacted by us. */
function formatHumanError(
  report: ErrorReport,
  extraLines: string[],
  format: ErrorFormat
): string {
  const sections: (FrameSection | undefined)[] = [
    ...(report.fields ?? []).map(
      (field) => `${field.field}: ${redactString(field.message)}`
    ),
    fixSection(report.fix),
    linkSection(report.docs),
    report.requestId ? `Request ID: ${report.requestId}` : undefined,
    ...extraLines,
  ];
  return frame(redactString(`${report.code}: ${report.message}`), sections, {
    format,
  });
}
