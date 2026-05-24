import { EXIT_CODES } from "@/errors/exit-codes.js";
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
} from "@/http/errors.js";
import { theme } from "@/output/theme.js";

interface MachineError {
  code: string;
  message: string;
  requestId?: string;
  statusCode?: number;
}

interface HumanMessage {
  suggestion?: string;
  title: string;
}

function classifyError(err: unknown): {
  exitCode: number;
  machine: MachineError;
  human: HumanMessage;
} {
  if (err instanceof UnauthorizedError) {
    return {
      exitCode: EXIT_CODES.AUTH_ERROR,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: {
        title: "Authentication failed. Run `frontal auth login`.",
        suggestion: "Run 'frontal auth login' to authenticate.",
      },
    };
  }

  if (err instanceof ForbiddenError) {
    return {
      exitCode: EXIT_CODES.PERMISSION_ERROR,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: {
        title: "Permission denied. Check your role/policy.",
        suggestion: "Check your role with 'frontal auth whoami'.",
      },
    };
  }

  if (err instanceof NotFoundError) {
    return {
      exitCode: EXIT_CODES.NOT_FOUND,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: {
        title: `Resource not found: ${err.message}`,
        suggestion:
          "Verify the resource ID. List resources with 'frontal <resource> list'.",
      },
    };
  }

  if (err instanceof ValidationError) {
    return {
      exitCode: EXIT_CODES.VALIDATION_ERROR,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: {
        title: `Validation failed:${err.fields ? "" : ` ${err.message}`}`,
        suggestion: err.fields ? undefined : undefined,
      },
    };
  }

  if (err instanceof RateLimitError) {
    const retryMsg = err.retryAfter ? ` Retry after ${err.retryAfter}s.` : "";
    return {
      exitCode: EXIT_CODES.RATE_LIMITED,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: {
        title: `Rate limit exceeded.${retryMsg}`,
        suggestion: err.retryAfter
          ? `Wait ${err.retryAfter}s and try again.`
          : "Wait and try again.",
      },
    };
  }

  if (err instanceof ConflictError) {
    return {
      exitCode: EXIT_CODES.GENERAL_ERROR,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: { title: `Conflict: ${err.message}` },
    };
  }

  if (err instanceof NetworkError) {
    return {
      exitCode: EXIT_CODES.NETWORK_ERROR,
      machine: { code: "NETWORK_ERROR", message: err.message },
      human: {
        title: "Could not reach the Frontal API.",
        suggestion:
          "Check your connection. Verify API URL with 'frontal config list'.",
      },
    };
  }

  if (err instanceof TimeoutError) {
    return {
      exitCode: EXIT_CODES.TIMEOUT_ERROR,
      machine: { code: "TIMEOUT_ERROR", message: err.message },
      human: {
        title: err.message,
        suggestion: "Request timed out. Try again or increase --timeout.",
      },
    };
  }

  if (err instanceof ApiError) {
    return {
      exitCode: EXIT_CODES.GENERAL_ERROR,
      machine: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId: err.requestId,
      },
      human: {
        title: `Server error (${err.statusCode}): ${err.message}`,
      },
    };
  }

  if (err instanceof Error) {
    return {
      exitCode: EXIT_CODES.GENERAL_ERROR,
      machine: { code: "UNHANDLED_ERROR", message: err.message },
      human: { title: err.message },
    };
  }

  return {
    exitCode: EXIT_CODES.GENERAL_ERROR,
    machine: {
      code: "UNEXPECTED_ERROR",
      message: "An unexpected error occurred.",
    },
    human: { title: "An unexpected error occurred." },
  };
}

export function handleError(
  err: unknown,
  globalOpts?: Record<string, unknown>
): never {
  const debug = globalOpts?.debug as boolean;
  const json = globalOpts?.json as boolean;
  const { exitCode, machine, human } = classifyError(err);

  if (!json) {
    console.error(theme.error(human.title));
    if (err instanceof ValidationError && err.fields) {
      for (const f of err.fields) {
        console.error(theme.error(`  - ${f.field}: ${f.message}`));
      }
    }
    if (human.suggestion) {
      console.error(theme.dim(`Suggestion: ${human.suggestion}`));
    }
  }

  if (json) {
    console.error(
      JSON.stringify({
        error: {
          code: machine.code,
          message: machine.message,
          statusCode: machine.statusCode,
          requestId: machine.requestId,
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
