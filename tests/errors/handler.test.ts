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
import { classifyError, renderError } from "@/errors/handler.js";

const HTTPS_URL = /^https:\/\//;

const response = (code: string, message = "boom") => ({
  code,
  message,
  requestId: "req_test_1",
});

describe("classifyError", () => {
  it.each([
    [new UnauthorizedError(response("UNAUTHORIZED")), EXIT_CODES.AUTH_ERROR],
    [new ForbiddenError(response("FORBIDDEN")), EXIT_CODES.PERMISSION_ERROR],
    [new NotFoundError(response("NOT_FOUND")), EXIT_CODES.NOT_FOUND],
    [
      new ValidationError(response("VALIDATION_ERROR")),
      EXIT_CODES.VALIDATION_ERROR,
    ],
    [new RateLimitError(response("RATE_LIMITED"), 5), EXIT_CODES.RATE_LIMITED],
    [new ConflictError(response("CONFLICT")), EXIT_CODES.GENERAL_ERROR],
    [new ServiceError(response("INTERNAL"), 503), EXIT_CODES.GENERAL_ERROR],
    [new FrontalError(response("CUSTOM"), 418), EXIT_CODES.GENERAL_ERROR],
  ])("maps SDK error %s to an exit code with a docs link", (err, exitCode) => {
    const report = classifyError(err);
    expect(report.exitCode).toBe(exitCode);
    expect(report.code).toBe(err.code);
    expect(report.requestId).toBe("req_test_1");
    expect(report.docs).toMatch(HTTPS_URL);
  });

  it("adds fix hints for well-known codes", () => {
    expect(
      classifyError(new UnauthorizedError(response("UNAUTHORIZED"))).fix
    ).toContain("frontal auth login");
    expect(
      classifyError(new NotFoundError(response("NOT_FOUND"))).fix
    ).toBeDefined();
    expect(
      classifyError(new ServiceError(response("INTERNAL"), 500)).fix
    ).toContain("server error");
  });

  it("uses the SDK docs url when present", () => {
    const err = new FrontalError(
      { ...response("X"), docs: "https://frontal.dev/docs/x" },
      400
    );
    expect(classifyError(err).docs).toBe("https://frontal.dev/docs/x");
  });

  it("maps network and timeout errors", () => {
    expect(
      classifyError(new NetworkError(new Error("ECONNREFUSED")))
    ).toMatchObject({
      code: "NETWORK_ERROR",
      exitCode: EXIT_CODES.NETWORK_ERROR,
    });
    expect(classifyError(new TimeoutError())).toMatchObject({
      code: "TIMEOUT",
      exitCode: EXIT_CODES.TIMEOUT_ERROR,
    });
  });

  it("uses the transport request id when the error has none", () => {
    const report = classifyError(new NetworkError(new Error("x")), {
      requestId: "req_from_transport",
    });
    expect(report.requestId).toBe("req_from_transport");
  });

  it("maps CliError with its own exit code and fix", () => {
    const err = new CliError("NO_CREDENTIALS", "none", {
      fix: "login",
      exitCode: EXIT_CODES.AUTH_ERROR,
    });
    expect(classifyError(err)).toMatchObject({
      code: "NO_CREDENTIALS",
      fix: "login",
      exitCode: EXIT_CODES.AUTH_ERROR,
      docs: "https://frontal.dev/docs/cli/errors#no-credentials",
    });
  });

  it("maps Zod errors to VALIDATION_ERROR with fields", () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    if (result.success) {
      throw new Error("expected failure");
    }
    const report = classifyError(result.error);
    expect(report.code).toBe("VALIDATION_ERROR");
    expect(report.exitCode).toBe(EXIT_CODES.VALIDATION_ERROR);
    expect(report.fields?.[0]?.field).toBe("name");
  });

  it("handles non-Error throwables", () => {
    expect(classifyError("nope").code).toBe("UNEXPECTED_ERROR");
  });
});

describe("renderError", () => {
  it("prints a machine-readable JSON envelope on stderr under --json", () => {
    const lines: string[] = [];
    vi.mocked(console.error).mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    renderError(new NotFoundError(response("NOT_FOUND", "gone")), {
      json: true,
    });

    const parsed = JSON.parse(lines.join("")) as {
      error: Record<string, unknown>;
    };
    expect(parsed.error).toMatchObject({
      code: "NOT_FOUND",
      message: "gone",
      requestId: "req_test_1",
      statusCode: 404,
    });
    expect(parsed.error.fix).toBeDefined();
    expect(parsed.error.docs).toBeDefined();
  });

  it("never prints secrets", () => {
    const lines: string[] = [];
    vi.mocked(console.error).mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    renderError(new Error("key frt_super_secret_value_123 leaked"), {});
    renderError(new Error("key frt_super_secret_value_123 leaked"), {
      json: true,
    });

    expect(lines.join("\n")).not.toContain("frt_super_secret_value_123");
    expect(lines.join("\n")).toContain("frt_[REDACTED]");
  });

  it("prints code, fix, docs and request id for humans", () => {
    const lines: string[] = [];
    vi.mocked(console.error).mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    renderError(new UnauthorizedError(response("UNAUTHORIZED")), {});

    const output = lines.join("\n");
    expect(output).toContain("UNAUTHORIZED");
    expect(output).toContain("Fix:");
    expect(output).toContain("Docs:");
    expect(output).toContain("Request ID: req_test_1");
  });
});
