import { isFrontalError } from "@frontal-labs/error";
import { describe, expect, it } from "vitest";
import { CliError, docsUrlFor } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";

describe("CliError", () => {
  it("is a tagged FrontalError with the cli scope", () => {
    const err = new CliError("NO_PROJECT", "No project config found.");
    expect(isFrontalError(err)).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect(err.scope).toBe("cli");
    expect(err.code).toBe("NO_PROJECT");
    expect(err.name).toBe("CliError");
  });

  it("derives the docs link from the code", () => {
    const err = new CliError("NO_PROJECT", "x");
    expect(err.docs).toBe("https://frontal.dev/docs/cli/errors#no-project");
    expect(err.docs).toBe(docsUrlFor("NO_PROJECT"));
  });

  it("honours an explicit docs link", () => {
    const err = new CliError("X_Y", "x", { docs: "https://example.test/x" });
    expect(err.docs).toBe("https://example.test/x");
  });

  it("defaults the exit code to general error", () => {
    expect(new CliError("X", "x").exitCode).toBe(EXIT_CODES.GENERAL_ERROR);
  });

  it("keeps fix, requestId and cause", () => {
    const cause = new Error("root");
    const err = new CliError("X", "x", {
      cause,
      exitCode: EXIT_CODES.AUTH_ERROR,
      fix: "Log in.",
      requestId: "req_1",
    });
    expect(err.fix).toBe("Log in.");
    expect(err.requestId).toBe("req_1");
    expect(err.exitCode).toBe(EXIT_CODES.AUTH_ERROR);
    expect(err.cause).toBe(cause);
  });
});
