import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initProject } from "@/commands/init.js";
import { followLogs, matchesFilter, sinceToIso } from "@/commands/logs.js";
import { DevServer } from "@/lib/dev/server.js";
import { Formatter } from "@/output/formatter.js";
import { lastJson, mockApi, runCli, TEST_API_KEY } from "./helpers/cli.js";

const INVALID_SINCE = /Invalid --since/;
const ISO_YEAR = /^\d{4}-/;
const NON_NAME = /[^a-z0-9-]+/g;

let root: string;
let server: DevServer | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-logs-"));
  initProject(root, {});
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(async () => {
  await server?.stop();
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("helpers", () => {
  it("parses --since durations and timestamps", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(sinceToIso("15m", now)).toBe("2026-01-01T11:45:00.000Z");
    expect(sinceToIso("2h", now)).toBe("2026-01-01T10:00:00.000Z");
    expect(sinceToIso("2025-12-31T00:00:00Z", now)).toBe(
      "2025-12-31T00:00:00.000Z"
    );
    expect(() => sinceToIso("soon", now)).toThrow(INVALID_SINCE);
  });

  it("filters entries client-side", () => {
    expect(matchesFilter({ message: "GET /agents" }, "agents")).toBe(true);
    expect(matchesFilter({ message: "GET /agents" }, "graph")).toBe(false);
    expect(matchesFilter({ message: "x" }, undefined)).toBe(true);
  });
});

describe("frontal logs (query)", () => {
  it("queries the observability API with the project query and window, printing NDJSON", async () => {
    const mock = await mockApi([
      {
        method: "POST",
        path: "/observability/logs/query",
        body: {
          data: [
            {
              id: "log_1",
              timestamp: "2026-01-01T00:00:00Z",
              level: "info",
              service: "api",
              message: "hello",
            },
            {
              id: "log_2",
              timestamp: "2026-01-01T00:00:01Z",
              level: "error",
              service: "api",
              message: "boom",
              metadata: { request_id: "req_9" },
            },
          ],
          pagination: { cursor: "c", has_more: true },
        },
      },
    ]);

    const result = await runCli([
      "logs",
      "--since",
      "1h",
      "--limit",
      "2",
      "--level",
      "error",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const request = mock.expectCalled("POST", "/observability/logs/query");
    expect(request.body).toMatchObject({
      query: `project:${root
        .split("/")
        .pop()
        ?.toLowerCase()
        .replace(NON_NAME, "-")}`,
      level: "error",
      limit: 2,
      order: "asc",
    });
    expect(String((request.body as { timeFrom: string }).timeFrom)).toMatch(
      ISO_YEAR
    );
    expect(result.stdout).toHaveLength(2);
    expect(JSON.parse(result.stdout[1] as string)).toMatchObject({
      id: "log_2",
      level: "error",
    });
  });

  it("uses --filter as the server query and applies it client-side too", async () => {
    await mockApi([
      {
        method: "POST",
        path: "/observability/logs/query",
        body: {
          data: [
            {
              id: "log_1",
              timestamp: "t",
              level: "info",
              message: "agents ok",
            },
            { id: "log_2", timestamp: "t", level: "info", message: "graph ok" },
          ],
          pagination: { cursor: "end", has_more: false },
        },
      },
    ]);

    const result = await runCli(["logs", "--filter", "agents"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("agents ok");
    expect(result.stdout.join("\n")).not.toContain("graph ok");
  });

  it("propagates API errors with request ids", async () => {
    await mockApi([
      {
        method: "POST",
        path: "/observability/logs/query",
        status: 403,
        body: { code: "FORBIDDEN", message: "no", requestId: "req_403" },
      },
    ]);
    const result = await runCli(["logs", "--json"]);
    expect(result.exitCode).toBe(4);
    expect(lastJson(result.stderr).error).toMatchObject({
      code: "FORBIDDEN",
      requestId: "req_403",
    });
  });
});

describe("frontal logs --follow", () => {
  it("tails the dev server's stream, reconnects on drops and stops on abort", async () => {
    server = new DevServer({ root, port: 0, globalOpts: {}, watch: false });
    const info = await server.start();
    const baseUrl = `${info.url}/v1`;
    const sdkModule = await import("@/lib/sdk.js");
    const globalOpts = { json: true, apiKey: TEST_API_KEY, apiUrl: baseUrl };
    const lines: string[] = [];
    vi.mocked(console.log).mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    const controller = new AbortController();
    const ctx = {
      globalOpts,
      fmt: Formatter.from(globalOpts),
      sdk: (options?: { signal?: AbortSignal }) =>
        sdkModule.createSdkHandle({
          credential: { kind: "api-key", apiKey: TEST_API_KEY },
          baseUrl,
          maxRetries: 0,
          signal: options?.signal,
        }),
    };
    const done = followLogs(
      ctx,
      { follow: true, filter: "agents" },
      controller.signal
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    await fetch(`${info.url}/v1/agents`);
    await fetch(`${info.url}/v1/ontology/graph/entities`);
    await vi.waitFor(
      () => expect(lines.some((l) => l.includes("GET /agents"))).toBe(true),
      { timeout: 3000 }
    );
    expect(lines.some((l) => l.includes("/ontology/graph"))).toBe(false);

    // Drop the server: the follower reports a reconnect and keeps trying.
    await server.stop();
    server = undefined;
    await vi.waitFor(
      () =>
        expect(lines.some((l) => l.includes('"type":"reconnect"'))).toBe(true),
      {
        timeout: 5000,
      }
    );

    controller.abort();
    await expect(done).resolves.toBeUndefined();
  }, 15_000);

  it("aborts immediately on auth errors instead of retrying", async () => {
    await mockApi([
      {
        method: "GET",
        path: "/observability/logs/stream",
        status: 401,
        body: { code: "UNAUTHORIZED", message: "nope", requestId: "req_401" },
      },
    ]);
    const result = await runCli(["logs", "--follow", "--json"]);
    expect(result.exitCode).toBe(3);
    expect(lastJson(result.stderr).error).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("logs default query", () => {
  it("falls back to * outside a project", async () => {
    const outside = mkdtempSync(join(tmpdir(), "frontal-nologs-"));
    writeFileSync(join(outside, "README"), "");
    vi.spyOn(process, "cwd").mockReturnValue(outside);
    const mock = await mockApi([
      {
        method: "POST",
        path: "/observability/logs/query",
        body: { data: [], pagination: { cursor: "end", has_more: false } },
      },
    ]);
    const result = await runCli(["logs"]);
    expect(result.exitCode).toBe(0);
    expect(
      mock.expectCalled("POST", "/observability/logs/query").body
    ).toMatchObject({ query: "*" });
    rmSync(outside, { recursive: true, force: true });
  });
});
