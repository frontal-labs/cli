import { execFile } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The synthetic monitor runs `.github/scripts/e2e-journey.sh` against the CLI
 * with real Frontal credentials. These tests run the same script against the
 * real CLI, with a mock Frontal API and a test key, so no repository secrets
 * are needed to verify the journeys and the result file they produce.
 */

const REPO_ROOT = join(import.meta.dirname, "..");
const JOURNEY_SCRIPT = join(REPO_ROOT, ".github", "scripts", "e2e-journey.sh");
const CLI_ENTRY = join(REPO_ROOT, "bin", "frontal.ts");
const TEST_API_KEY = "frt_test_monitor_key_0000000000";
const RUN_TIMEOUT_MS = 120_000;

interface JourneyEntry {
  name: string;
  status: string;
}

interface RunResult {
  journeys: Record<string, unknown>;
  summary: { journeys_failed: number; journeys_passed: number };
}

let server: Server;
let apiUrl: string;
let scratch: string;
let cliWrapper: string;

/** A minimal Frontal API: `GET /v1/workflows` accepts only the test key. */
function startMockApi(): Promise<Server> {
  return new Promise((resolve) => {
    const mock = createServer((req, res) => {
      const authorized = req.headers.authorization === `Bearer ${TEST_API_KEY}`;
      const json = (status: number, body: unknown): void => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (!authorized) {
        json(401, {
          code: "UNAUTHORIZED",
          message: "Invalid or missing API key",
          requestId: "req_mock_401",
        });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/v1/workflows")) {
        json(200, {
          data: [{ id: "wf_monitor", name: "nightly" }],
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
  server = await startMockApi();
  const { port } = server.address() as AddressInfo;
  apiUrl = `http://127.0.0.1:${port}/v1`;
  scratch = mkdtempSync(join(tmpdir(), "frontal-monitor-test-"));
  // The journeys call `$CLI`, so point it at a wrapper around the real CLI
  // with an isolated config directory and a pinned version.
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
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(scratch, { force: true, recursive: true });
});

/**
 * Runs the monitor's journey script with the given Frontal credentials. This
 * is async on purpose: the mock API lives in this process, so a blocking
 * child process would stop it from answering.
 */
function runMonitor(
  env: Record<string, string | undefined>
): Promise<RunResult> {
  const resultFile = join(
    scratch,
    `run-result-${Math.random().toString(36).slice(2)}.json`
  );
  const childEnv: Record<string, string> = {
    CLI_BIN: cliWrapper,
    E2E_RESULT_FILE: resultFile,
    E2E_TIMEOUT_SECS: "60",
    HOME: scratch,
    PATH: process.env.PATH ?? "",
  };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }
  // The script exits non-zero when a journey fails. The result file is still
  // written, and that is what the tests assert on.
  return new Promise<RunResult>((resolve, reject) => {
    execFile(
      "bash",
      [JOURNEY_SCRIPT],
      { cwd: scratch, env: childEnv, timeout: RUN_TIMEOUT_MS },
      (error) => {
        if (error?.killed) {
          reject(error);
          return;
        }
        resolve(JSON.parse(readFileSync(resultFile, "utf-8")) as RunResult);
      }
    );
  });
}

/** Flattens the journeys object into `{ name, status }` entries. */
function entries(result: RunResult): JourneyEntry[] {
  const found: JourneyEntry[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (
        typeof record.name === "string" &&
        typeof record.status === "string"
      ) {
        found.push({ name: record.name, status: record.status });
        return;
      }
      for (const item of Object.values(record)) {
        visit(item);
      }
    }
  };
  visit(result.journeys);
  return found;
}

describe("synthetic monitor journeys", () => {
  it(
    "pass against the mock API with a valid key",
    async () => {
      const result = await runMonitor({
        FRONTAL_API_KEY: TEST_API_KEY,
        FRONTAL_API_URL: apiUrl,
      });

      const failed = entries(result).filter((entry) => entry.status !== "pass");
      const details = JSON.stringify(
        (result.journeys as Record<string, unknown>).api ?? null
      ).slice(0, 1500);
      expect(
        failed.map((entry) => entry.name),
        details
      ).toEqual([]);
      expect(result.summary.journeys_failed).toBe(0);
      expect(result.summary.journeys_passed).toBeGreaterThan(0);
      expect(
        entries(result).find((entry) => entry.name === "api-connectivity")
          ?.status
      ).toBe("pass");
    },
    RUN_TIMEOUT_MS
  );

  it(
    "fail only the authenticated connectivity journey when the key is missing",
    async () => {
      const result = await runMonitor({
        FRONTAL_API_KEY: "",
        FRONTAL_API_URL: apiUrl,
      });

      expect(result.summary.journeys_failed).toBe(1);
      const failed = entries(result).filter((entry) => entry.status !== "pass");
      expect(failed.map((entry) => entry.name)).toEqual(["api-connectivity"]);
    },
    RUN_TIMEOUT_MS
  );
});
