import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Smoke test of the CLI's account and workflow calls against a Frontal API.
 *
 * By default the API is a local mock, so no secrets are needed. Set
 * FRONTAL_LIVE=1 with TEST_API_KEY (or FRONTAL_API_KEY) and TEST_API_URL to
 * run the same commands against a real environment:
 *
 *   FRONTAL_LIVE=1 TEST_API_KEY=frt_... TEST_API_URL=https://api.staging.frontal.dev/v1 \
 *     bun run test tests/live
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const CLI_ENTRY = join(REPO_ROOT, "bin", "frontal.ts");
const MOCK_KEY = "frt_test_staging_smoke_key_000000";
const LIVE_KEY = process.env.TEST_API_KEY ?? process.env.FRONTAL_API_KEY;
const live = process.env.FRONTAL_LIVE === "1" && Boolean(LIVE_KEY);
const RUN_TIMEOUT_MS = 60_000;

let server: Server | undefined;
let scratch: string;
let apiUrl: string;
let apiKey: string;
let cliWrapper: string;

/** A mock API covering the account and workflow endpoints the CLI calls. */
function startMockApi(): Promise<Server> {
  return new Promise((resolve) => {
    const mock = createServer((req, res) => {
      const json = (status: number, body: unknown): void => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${MOCK_KEY}`) {
        json(401, {
          code: "UNAUTHORIZED",
          message: "Invalid or missing API key",
          requestId: "req_mock_401",
        });
        return;
      }
      const [path] = (req.url ?? "").split("?");
      if (req.method === "GET" && path === "/v1/auth/account/profile") {
        json(200, {
          email: "smoke@example.test",
          id: "user_mock",
          name: "Smoke",
        });
        return;
      }
      if (req.method === "GET" && path === "/v1/workflows") {
        json(200, {
          data: [{ id: "wf_smoke", name: "nightly" }],
          pagination: { cursor: null, has_more: false },
        });
        return;
      }
      json(404, {
        code: "NOT_FOUND",
        message: "Not Found",
        requestId: "req_mock_404",
      });
    });
    mock.listen(0, "127.0.0.1", () => resolve(mock));
  });
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "frontal-staging-smoke-"));
  cliWrapper = join(scratch, "frontal");
  writeFileSync(
    cliWrapper,
    [
      "#!/usr/bin/env bash",
      `export FRONTAL_CONFIG_DIR="${join(scratch, "config")}"`,
      "export FRONTAL_CLI_VERSION=0.0.0-test",
      `exec bun "${CLI_ENTRY}" "$@"`,
      "",
    ].join("\n")
  );
  chmodSync(cliWrapper, 0o755);

  if (live) {
    apiUrl =
      process.env.TEST_API_URL ??
      process.env.FRONTAL_API_URL ??
      "https://api.frontal.dev/v1";
    apiKey = LIVE_KEY as string;
    return;
  }
  server = await startMockApi();
  const { port } = server.address() as AddressInfo;
  apiUrl = `http://127.0.0.1:${port}/v1`;
  apiKey = MOCK_KEY;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
  rmSync(scratch, { force: true, recursive: true });
});

describe("staging smoke: CLI account and workflow calls", () => {
  it(
    "authenticates and returns the account profile",
    async () => {
      const env = { FRONTAL_API_KEY: apiKey, FRONTAL_API_URL: apiUrl };
      const result = await runWithEnv(["auth", "whoami", "--json"], env);
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        authMethod: "api-key",
      });
    },
    RUN_TIMEOUT_MS
  );

  it(
    "lists workflows through the paginated endpoint",
    async () => {
      const env = { FRONTAL_API_KEY: apiKey, FRONTAL_API_URL: apiUrl };
      const result = await runWithEnv(
        ["workflows", "list", "--limit", "1", "--json"],
        env
      );
      expect(result.code, result.stderr).toBe(0);
      const page = JSON.parse(result.stdout) as { data: { name: string }[] };
      expect(Array.isArray(page.data)).toBe(true);
    },
    RUN_TIMEOUT_MS
  );
});

/** runCli with extra environment variables for the child process. */
function runWithEnv(
  args: string[],
  extra: Record<string, string>
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      cliWrapper,
      args,
      {
        env: {
          HOME: process.env.HOME ?? scratch,
          PATH: process.env.PATH ?? "",
          ...extra,
        },
        timeout: RUN_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error && typeof error.code === "number" ? error.code : 0,
          stderr,
          stdout,
        });
      }
    );
  });
}
