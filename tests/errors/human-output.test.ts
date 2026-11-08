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

  it("colours a terminal error when NO_COLOR is unset", () => {
    // Positive control: proves the terminal setup really enables colour, so
    // the NO_COLOR test below is not passing for an unrelated reason.
    withTerminal(() => {
      const output = captureHuman({ color: true }, unauthorized());
      expect(output).toContain(ESC);
    });
  });

  it("has no ANSI codes when NO_COLOR is set on a terminal", () => {
    process.env.NO_COLOR = "1";
    withTerminal(() => {
      const output = captureHuman({ color: true }, unauthorized());
      expect(output).not.toContain(ESC);
    });
  });

  it("has no ANSI codes when stderr is not a TTY", () => {
    // Vitest captures stderr, so `auto` resolves to plain here.
    const output = captureHuman({ color: true }, unauthorized());
    expect(output).not.toContain(ESC);
  });

  it("has no ANSI codes when only stdout is a TTY", () => {
    // `frontal ... 2> err.txt` from a terminal: stderr is what gets written.
    withTerminal(() => {
      setTty("stderr", false);
      const output = captureHuman({ color: true }, unauthorized());
      expect(output).not.toContain(ESC);
    });
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

/** Runs `fn` with both stdout and stderr reporting as terminals. */
function withTerminal(fn: () => void): void {
  const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  setTty("stdout", true);
  setTty("stderr", true);
  try {
    fn();
  } finally {
    restoreTty("stdout", stdoutTty);
    restoreTty("stderr", stderrTty);
  }
}

function setTty(name: "stderr" | "stdout", value: boolean): void {
  Object.defineProperty(process[name], "isTTY", {
    configurable: true,
    value,
  });
}

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
