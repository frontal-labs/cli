import { createMockFetch, type MockRoute } from "@frontal-labs/testing";
import { vi } from "vitest";

export const TEST_API_KEY = "frt_test_api_key_1234567890";
export const TEST_BASE_URL = "https://api.test.frontal.dev/v1";

export type MockApi = ReturnType<typeof createMockFetch>;

/**
 * Installs a mocked transport for `getSdk()` so commands exercise the real
 * SDK client against recorded routes. Returns the mock handle.
 */
export async function mockApi(routes: MockRoute[] = []): Promise<MockApi> {
  const mock = createMockFetch(routes);
  const sdkModule = await import("@/lib/sdk.js");
  vi.spyOn(sdkModule, "getSdk").mockImplementation((globalOpts, options) =>
    sdkModule.createSdkHandle({
      credential: options?.anonymous
        ? { kind: "anonymous" }
        : { kind: "api-key", apiKey: TEST_API_KEY },
      baseUrl: (globalOpts.apiUrl as string | undefined) ?? TEST_BASE_URL,
      fetch: mock.fetch,
      maxRetries: 0,
      signal: options?.signal,
    })
  );
  return mock;
}

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
  vi.mocked(console.log).mockImplementation((...parts: unknown[]) => {
    stdout.push(parts.map(String).join(" "));
  });
  vi.mocked(console.error).mockImplementation((...parts: unknown[]) => {
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
      exitCode = err.exitCode;
    } else {
      throw err;
    }
  }
  return { exitCode, stdout, stderr };
}

export function lastJson(lines: string[]): Record<string, unknown> {
  const text = lines.join("\n").trim();
  return JSON.parse(text) as Record<string, unknown>;
}
