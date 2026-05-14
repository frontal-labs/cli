import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "../http/errors.js";
import { theme } from "../output/theme.js";
import { EXIT_CODES } from "./exit-codes.js";

export function handleError(
  err: unknown,
  globalOpts?: Record<string, unknown>
): never {
  const debug = globalOpts?.debug as boolean;
  const json = globalOpts?.json as boolean;
  const logHuman = !json;

  let exitCode: number = EXIT_CODES.GENERAL_ERROR;
  let machineCode = "UNEXPECTED_ERROR";
  let machineMessage = "An unexpected error occurred.";
  let machineStatusCode: number | undefined;
  let machineRequestId: string | undefined;

  if (err instanceof UnauthorizedError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    if (logHuman) {
      console.error(
        theme.error("Authentication failed. Run `frontal auth login`.")
      );
      console.error(
        theme.dim("Suggestion: Run 'frontal auth login' to authenticate.")
      );
    }
    exitCode = EXIT_CODES.AUTH_ERROR;
  } else if (err instanceof ForbiddenError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    if (logHuman) {
      console.error(theme.error("Permission denied. Check your role/policy."));
      console.error(
        theme.dim("Suggestion: Check your role with 'frontal auth whoami'.")
      );
    }
    exitCode = EXIT_CODES.PERMISSION_ERROR;
  } else if (err instanceof NotFoundError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    if (logHuman) {
      console.error(theme.error(`Resource not found: ${err.message}`));
      console.error(
        theme.dim(
          "Suggestion: Verify the resource ID. List resources with 'frontal <resource> list'."
        )
      );
    }
    exitCode = EXIT_CODES.NOT_FOUND;
  } else if (err instanceof ValidationError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    if (logHuman) {
      console.error(theme.error("Validation failed:"));
      if (err.fields) {
        for (const f of err.fields) {
          console.error(theme.error(`  - ${f.field}: ${f.message}`));
        }
      } else {
        console.error(theme.error(`  ${err.message}`));
      }
    }
    exitCode = EXIT_CODES.VALIDATION_ERROR;
  } else if (err instanceof RateLimitError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    const retryMsg = err.retryAfter ? ` Retry after ${err.retryAfter}s.` : "";
    if (logHuman) {
      console.error(theme.error(`Rate limit exceeded.${retryMsg}`));
      console.error(
        theme.dim(
          err.retryAfter
            ? `Suggestion: Wait ${err.retryAfter}s and try again.`
            : "Suggestion: Wait and try again."
        )
      );
    }
    exitCode = EXIT_CODES.RATE_LIMITED;
  } else if (err instanceof ConflictError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    if (logHuman) {
      console.error(theme.error(`Conflict: ${err.message}`));
    }
    exitCode = EXIT_CODES.GENERAL_ERROR;
  } else if (err instanceof NetworkError) {
    machineCode = "NETWORK_ERROR";
    machineMessage = err.message;
    if (logHuman) {
      console.error(theme.error("Could not reach the Frontal API."));
      console.error(
        theme.dim(
          "Suggestion: Check your connection. Verify API URL with 'frontal config list'."
        )
      );
    }
    exitCode = EXIT_CODES.NETWORK_ERROR;
  } else if (err instanceof TimeoutError) {
    machineCode = "TIMEOUT_ERROR";
    machineMessage = err.message;
    if (logHuman) {
      console.error(theme.error(err.message));
      console.error(
        theme.dim(
          "Suggestion: Request timed out. Try again or increase --timeout."
        )
      );
    }
    exitCode = EXIT_CODES.TIMEOUT_ERROR;
  } else if (err instanceof ApiError) {
    machineCode = err.code;
    machineMessage = err.message;
    machineStatusCode = err.statusCode;
    machineRequestId = err.requestId;
    if (logHuman) {
      console.error(
        theme.error(`Server error (${err.statusCode}): ${err.message}`)
      );
    }
    exitCode = EXIT_CODES.GENERAL_ERROR;
  } else if (err instanceof Error) {
    machineCode = "UNHANDLED_ERROR";
    machineMessage = err.message;
    if (logHuman) {
      console.error(theme.error(err.message));
    }
  } else {
    if (logHuman) {
      console.error(theme.error("An unexpected error occurred."));
    }
  }

  if (json) {
    console.error(
      JSON.stringify({
        error: {
          code: machineCode,
          message: machineMessage,
          statusCode: machineStatusCode,
          requestId: machineRequestId,
        },
      })
    );
    process.exit(exitCode);
  }

  if (debug && err instanceof Error) {
    console.error();
    if (err instanceof ApiError) {
      if (err.requestId) {
        console.error(theme.dim(`Request ID: ${err.requestId}`));
      }
      console.error(theme.dim(`Status Code: ${err.statusCode}`));
      console.error(theme.dim(`Error Code:  ${err.code}`));
    }
    console.error(theme.dim(err.stack ?? ""));
  }

  process.exit(exitCode);
}
