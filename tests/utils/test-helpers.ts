import type { Mock } from "vitest";
import { vi } from "vitest";

// Test helper functions
export function createMockFetch(
  response: unknown,
  options: { status?: number; delay?: number } = {}
) {
  const { status = 200, delay = 0 } = options;

  return vi.fn(() =>
    delay > 0
      ? new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: status >= 200 && status < 300,
                status,
                json: () => Promise.resolve(response),
                text: () => Promise.resolve(JSON.stringify(response)),
                blob: () =>
                  Promise.resolve(new Blob([JSON.stringify(response)])),
              }),
            delay
          )
        )
      : Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(response),
          text: () => Promise.resolve(JSON.stringify(response)),
          blob: () => Promise.resolve(new Blob([JSON.stringify(response)])),
        })
  );
}

export function createMockStream(events: unknown[]) {
  return async function* mockStream() {
    for (const event of events) {
      yield event;
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay between events
    }
  };
}

export function mockConsole() {
  const consoleSpy = {
    log: vi.spyOn(console, "log").mockImplementation(() => {
      // Silently ignore console output
    }),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {
      // Silently ignore console output
    }),
    error: vi.spyOn(console, "error").mockImplementation(() => {
      // Silently ignore console output
    }),
    info: vi.spyOn(console, "info").mockImplementation(() => {
      // Silently ignore console output
    }),
    debug: vi.spyOn(console, "debug").mockImplementation(() => {
      // Silently ignore console output
    }),
  };

  return consoleSpy;
}

export function restoreConsole(consoleSpy: ReturnType<typeof mockConsole>) {
  for (const spy of Object.values(consoleSpy)) {
    spy.mockRestore();
  }
}

export function createTempConfig(overrides: Record<string, unknown> = {}) {
  return {
    default: {
      apiUrl: "https://api.test.com",
      apiKey: "test-key",
      org: "test-org",
      workspace: "test-workspace",
      ...overrides,
    },
  };
}

export function createMockResolved<T>(value: T): Mock {
  return vi.fn().mockResolvedValue(value) as Mock;
}

export function createMockRejected<_T>(error: Error): Mock {
  return vi.fn().mockRejectedValue(error) as Mock;
}

export function waitFor(
  condition: () => boolean,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Condition not met within ${timeout}ms`));
      } else {
        setTimeout(check, 10);
      }
    };

    check();
  });
}

export function createMockProcess(overrides: Partial<NodeJS.Process> = {}) {
  return {
    argv: ["node", "frontal"],
    env: { ...process.env },
    exit: vi.fn(),
    stdin: {
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
    },
    stdout: {
      write: vi.fn(),
    },
    stderr: {
      write: vi.fn(),
    },
    ...overrides,
  } as NodeJS.Process;
}

export function captureStdout() {
  const outputs: string[] = [];
  const originalWrite = process.stdout.write;

  process.stdout.write = vi.fn((chunk: Buffer | string) => {
    outputs.push(chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  return {
    outputs,
    restore: () => {
      process.stdout.write = originalWrite;
    },
  };
}

export function captureStderr() {
  const outputs: string[] = [];
  const originalWrite = process.stderr.write;

  process.stderr.write = vi.fn((chunk: Buffer | string) => {
    outputs.push(chunk.toString());
    return true;
  }) as typeof process.stderr.write;

  return {
    outputs,
    restore: () => {
      process.stderr.write = originalWrite;
    },
  };
}
