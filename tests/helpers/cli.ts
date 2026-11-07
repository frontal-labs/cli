import { createMockFetch, type MockRoute } from "@frontal-labs/testing";
import { vi } from "vitest";
import { getSdk } from "@/lib/sdk.js";

export const TEST_API_KEY = "frt_test_api_key_1234567890";
export const TEST_BASE_URL = "https://api.test.frontal.dev/v1";

export type MockApi = ReturnType<typeof createMockFetch>;

// Hoisted so the `vi.mock` factory below can reference it: factories run
// before module-level code, so a plain `const` here would be uninitialized.
const mockState = vi.hoisted(() => ({
  enabled: false,
  fetch: null as ReturnType<typeof createMockFetch>["fetch"] | null,
  routes: [] as MockRoute[],
}));

// Replace `getSdk` with a spy that routes through the real SDK client once
// `mockApi()` has installed a fetch, and falls back to the real `getSdk`
// otherwise. Everything else in the module stays the original.
vi.mock("@/lib/sdk.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sdk.js")>();
  return {
    ...actual,
    getSdk: vi.fn(async (globalOpts: any, options: any) => {
      if (!(mockState.enabled && mockState.fetch)) {
        return actual.getSdk(globalOpts, options);
      }
      return actual.createSdkHandle({
        baseUrl: (globalOpts.apiUrl as string | undefined) ?? TEST_BASE_URL,
        credential: options?.anonymous
          ? { kind: "anonymous" }
          : { apiKey: TEST_API_KEY, kind: "api-key" },
        fetch: mockState.fetch,
        maxRetries: 0,
        signal: options?.signal,
      });
    }),
  };
});

/**
 * Installs a mocked transport for `getSdk()` so commands exercise the real
 * SDK client against recorded routes. Returns the mock handle.
 */
export async function mockApi(routes: MockRoute[] = []): Promise<MockApi> {
  mockState.routes = routes;
  mockState.enabled = true;
  // Create the mock and store its fetch in mockState
  const mock = createMockFetch(routes);
  mockState.fetch = mock.fetch;
  return mock;
}

/**
 * Clears the mock state. Call in afterEach to prevent cross-test pollution.
 */
export function clearMockApi(): void {
  mockState.routes = [];
  mockState.fetch = null;
  mockState.enabled = false;
  vi.mocked(getSdk).mockClear();
}

export { mockState };

export class ExitError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(`process.exit(${exitCode})`);
    this.name = "ExitError";
    this.exitCode = exitCode;
  }
}

/** Makes `process.exit` throw so error paths can be asserted. */
export function trapExit(): void {
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
  }) as never);
}

export interface CliResult {
  exitCode: number;
  stderr: string[];
  stdout: string[];
}

/** Runs the CLI in-process and captures stdout/stderr lines and exit code. */
export async function runCli(args: string[]): Promise<CliResult> {
  trapExit();
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    stdout.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    stderr.push(parts.map(String).join(" "));
  });
  // commander writes --help / usage errors straight to the streams.
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  }) as never);
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  }) as never);

  const { run } = await import("@/cli.js");
  let exitCode = 0;
  try {
    await run(["node", "frontal", ...args]);
  } catch (err) {
    if (err instanceof ExitError) {
      ({ exitCode } = err);
    } else {
      throw err;
    }
  }
  return { exitCode, stderr, stdout };
}

export function lastJson(lines: string[]): Record<string, unknown> {
  const text = lines.join("\n").trim();
  return JSON.parse(text) as Record<string, unknown>;
}

/** Retries `fn` until it stops throwing, failing with the last error on timeout. */
export async function waitFor(
  fn: () => void | Promise<void>,
  { interval = 50, timeout = 3000 } = {}
): Promise<void> {
  const start = Date.now();
  const attempt = async (): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      if (Date.now() - start > timeout) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      await attempt();
    }
  };
  await attempt();
}
