import { UnauthorizedError } from "@frontal-labs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderError } from "@/errors/handler.js";

const ESC = String.fromCharCode(27);

function captureHuman(
  globalOpts: Record<string, unknown>,
  err: unknown
): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  try {
    renderError(err, globalOpts);
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

const unauthorized = () =>
  new UnauthorizedError({
    code: "UNAUTHORIZED",
    message: "bad key frt_super_secret_value_123",
    requestId: "req_human_1",
  });

describe("human error output", () => {
  let savedNoColor: string | undefined;
  let savedForceColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env.NO_COLOR;
    savedForceColor = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
  });

  afterEach(() => {
    restoreEnv("NO_COLOR", savedNoColor);
    restoreEnv("FORCE_COLOR", savedForceColor);
  });

  it("has no ANSI codes under --no-color, even with FORCE_COLOR", () => {
    process.env.FORCE_COLOR = "1";
    const output = captureHuman({ color: false }, unauthorized());
    expect(output).not.toContain(ESC);
  });

  it("has no ANSI codes when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });
    try {
      const output = captureHuman({ color: true }, unauthorized());
      expect(output).not.toContain(ESC);
    } finally {
      restoreTty("stderr", stderrTty);
    }
  });

  it("has no ANSI codes when stderr is not a TTY", () => {
    // Vitest captures stderr, so `auto` resolves to plain here.
    const output = captureHuman({ color: true }, unauthorized());
    expect(output).not.toContain(ESC);
  });

  it("has no ANSI codes when only stdout is a TTY", () => {
    // `frontal ... 2> err.txt` from a terminal: stderr is what gets written.
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: false,
    });
    try {
      const output = captureHuman({ color: true }, unauthorized());
      expect(output).not.toContain(ESC);
    } finally {
      restoreTty("stdout", stdoutTty);
      restoreTty("stderr", stderrTty);
    }
  });

  it("still redacts API keys in human output", () => {
    const output = captureHuman({ color: false }, unauthorized());
    expect(output).not.toContain("frt_super_secret_value_123");
    expect(output).toContain("frt_[REDACTED]");
  });

  it("keeps the request id and fix in the frame", () => {
    const output = captureHuman({ color: false }, unauthorized());
    expect(output).toContain("Request ID: req_human_1");
    expect(output).toContain("frontal auth login");
  });
});

function restoreTty(
  name: "stderr" | "stdout",
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(process[name], "isTTY", descriptor);
  } else {
    Reflect.deleteProperty(process[name], "isTTY");
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
