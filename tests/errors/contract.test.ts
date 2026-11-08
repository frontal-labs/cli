import {
  ConflictError,
  ForbiddenError,
  FrontalError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServiceError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "@frontal-labs/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { renderError } from "@/errors/handler.js";

/**
 * Public contract: the `--json` stderr envelope and the exit codes must not
 * change. These tests pin both. Snapshots are updated only by an intentional,
 * versioned change to the contract.
 */

const REQUEST_ID = "req_contract_1";

const response = (
  code: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  code,
  message: "boom",
  requestId: REQUEST_ID,
  ...extra,
});

function zodError(): Error {
  const result = z
    .object({ name: z.string(), port: z.number() })
    .safeParse({ name: 1, port: "x" });
  if (result.success) {
    throw new Error("expected Zod failure");
  }
  return result.error;
}

interface Case {
  error: () => unknown;
  exitCode: number;
  name: string;
}

const CASES: Case[] = [
  {
    error: () =>
      new CliError("NO_PROJECT", "No project config found in /work.", {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Run `frontal init`.",
        requestId: REQUEST_ID,
      }),
    exitCode: EXIT_CODES.CONFIG_ERROR,
    name: "CliError",
  },
  {
    error: () =>
      new CliError("CONFIG_INVALID", "Unknown environment.", {
        docs: "https://frontal.dev/docs/custom",
        exitCode: EXIT_CODES.CONFIG_ERROR,
      }),
    exitCode: EXIT_CODES.CONFIG_ERROR,
    name: "CliError with custom docs and exit code",
  },
  {
    error: zodError,
    exitCode: EXIT_CODES.VALIDATION_ERROR,
    name: "ZodError",
  },
  {
    error: () => new NetworkError(new Error("ECONNREFUSED")),
    exitCode: EXIT_CODES.NETWORK_ERROR,
    name: "NetworkError",
  },
  {
    error: () => new TimeoutError(),
    exitCode: EXIT_CODES.TIMEOUT_ERROR,
    name: "TimeoutError",
  },
  {
    error: () => new UnauthorizedError(response("UNAUTHORIZED")),
    exitCode: EXIT_CODES.AUTH_ERROR,
    name: "UnauthorizedError",
  },
  {
    error: () => new ForbiddenError(response("FORBIDDEN")),
    exitCode: EXIT_CODES.PERMISSION_ERROR,
    name: "ForbiddenError",
  },
  {
    error: () => new NotFoundError(response("NOT_FOUND", { message: "gone" })),
    exitCode: EXIT_CODES.NOT_FOUND,
    name: "NotFoundError",
  },
  {
    error: () =>
      new ValidationError(
        response("VALIDATION_ERROR", {
          fields: [
            { field: "name", message: "Required" },
            { field: "ports.0", message: "Expected number" },
          ],
        })
      ),
    exitCode: EXIT_CODES.VALIDATION_ERROR,
    name: "ValidationError with fields",
  },
  {
    error: () => new RateLimitError(response("RATE_LIMITED"), 5),
    exitCode: EXIT_CODES.RATE_LIMITED,
    name: "RateLimitError with retryAfter",
  },
  {
    error: () => new ConflictError(response("CONFLICT")),
    exitCode: EXIT_CODES.GENERAL_ERROR,
    name: "ConflictError",
  },
  {
    error: () => new ServiceError(response("INTERNAL"), 503),
    exitCode: EXIT_CODES.GENERAL_ERROR,
    name: "ServiceError 503",
  },
  {
    error: () => new FrontalError(response("CUSTOM"), 418),
    exitCode: EXIT_CODES.GENERAL_ERROR,
    name: "FrontalError with unmapped status",
  },
  {
    error: () => new Error("key frt_super_secret_value_123 leaked"),
    exitCode: EXIT_CODES.GENERAL_ERROR,
    name: "plain Error with a secret",
  },
  {
    error: () => "not an error object",
    exitCode: EXIT_CODES.GENERAL_ERROR,
    name: "non-Error value",
  },
];

function captureStderr(run: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

describe("--json error contract", () => {
  it.each(CASES)("keeps the stderr envelope for $name", ({ error }) => {
    const output = captureStderr(() => {
      renderError(error(), { json: true });
    });
    expect(output).toMatchSnapshot();
  });

  it("never prints the secret under --json", () => {
    const output = captureStderr(() => {
      renderError(new Error("key frt_super_secret_value_123 leaked"), {
        json: true,
      });
    });
    expect(output).not.toContain("frt_super_secret_value_123");
    expect(output).toContain("frt_[REDACTED]");
  });
});

describe("exit code table", () => {
  it.each(CASES)("maps $name to exit code $exitCode", ({ error, exitCode }) => {
    const report = renderErrorQuietly(error());
    expect(report.exitCode).toBe(exitCode);
  });
});

function renderErrorQuietly(err: unknown): ReturnType<typeof renderError> {
  let report: ReturnType<typeof renderError> | undefined;
  captureStderr(() => {
    report = renderError(err, { json: true });
  });
  if (!report) {
    throw new Error("renderError returned no report");
  }
  return report;
}
