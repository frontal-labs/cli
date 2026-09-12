import { mockPageResponse } from "@frontal-labs/testing";
import { describe, expect, it } from "vitest";
import { lastJson, mockApi, runCli, TEST_API_KEY } from "../helpers/cli.js";

const HTTPS_URL = /^https:/;

const workflow = {
  created_at: "2026-01-01T00:00:00Z",
  id: "wf_1",
  name: "nightly",
  status: "active",
  steps: [],
  triggers: [{ type: "manual" }],
  updated_at: "2026-01-01T00:00:00Z",
};

describe("frontal workflows", () => {
  it("list calls GET /workflows through the SDK with pagination params", async () => {
    const mock = await mockApi([
      { body: mockPageResponse([workflow]), method: "GET", path: "/workflows" },
    ]);

    const result = await runCli([
      "workflows",
      "list",
      "--limit",
      "5",
      "--cursor",
      "abc",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const request = mock.expectCalled("GET", "/workflows");
    expect(request.url).toContain("limit=5");
    expect(request.url).toContain("cursor=abc");
    expect(request.headers.authorization).toBe(`Bearer ${TEST_API_KEY}`);
    const output = lastJson(result.stdout) as {
      data: { name: string }[];
      pagination: { hasMore: boolean };
    };
    expect(output.data[0]?.name).toBe("nightly");
    expect(output.pagination.hasMore).toBe(false);
  });

  it("create validates the definition with the SDK and posts it", async () => {
    const mock = await mockApi([
      { body: workflow, method: "POST", path: "/workflows", status: 201 },
    ]);

    const result = await runCli([
      "workflows",
      "create",
      "--body",
      JSON.stringify({
        name: "nightly",
        steps: [{ config: {}, id: "s1", name: "run", type: "task" }],
        triggers: [{ type: "manual" }],
      }),
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const request = mock.expectCalled("POST", "/workflows");
    expect(request.body).toMatchObject({ name: "nightly" });
    expect(lastJson(result.stdout)).toMatchObject({ id: "wf_1" });
  });

  it("create rejects an invalid definition before any request", async () => {
    const mock = await mockApi([]);

    const result = await runCli([
      "workflows",
      "create",
      "--body",
      JSON.stringify({ triggers: "nope" }),
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(mock.requests).toHaveLength(0);
    expect(lastJson(result.stderr)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("search and batch post raw bodies", async () => {
    const mock = await mockApi([
      { body: { results: [] }, method: "POST", path: "/workflows/search" },
      { body: { ok: true }, method: "POST", path: "/workflows/batch" },
    ]);

    await runCli(["workflows", "search", "--body", '{"query":"x"}', "--json"]);
    await runCli([
      "workflows",
      "batch",
      "--body",
      '{"ids":["wf_1"]}',
      "--json",
    ]);

    mock.expectCalledWith("POST", "/workflows/search", { query: "x" });
    mock.expectCalledWith("POST", "/workflows/batch", { ids: ["wf_1"] });
  });

  it("run get/summary use the workflow accessor paths", async () => {
    const mock = await mockApi([
      { body: { s: 1 }, method: "GET", path: "/workflows/wf_1/run_9/summary" },
      { body: { id: "run_9" }, method: "GET", path: "/workflows/wf_1/run_9" },
    ]);

    const get = await runCli([
      "workflows",
      "run",
      "get",
      "wf_1",
      "run_9",
      "--json",
    ]);
    const summary = await runCli([
      "workflows",
      "run",
      "summary",
      "wf_1",
      "run_9",
      "--json",
    ]);

    expect(get.exitCode).toBe(0);
    expect(summary.exitCode).toBe(0);
    mock.expectCalled("GET", "/workflows/wf_1/run_9");
    mock.expectCalled("GET", "/workflows/wf_1/run_9/summary");
    expect(lastJson(summary.stdout)).toEqual({ s: 1 });
  });

  it("surfaces API errors with code, fix, docs and request id", async () => {
    await mockApi([
      {
        body: {
          code: "UNAUTHORIZED",
          message: "bad key",
          requestId: "req_401",
        },
        method: "GET",
        path: "/workflows",
        status: 401,
      },
    ]);

    const result = await runCli(["workflows", "list", "--json"]);

    expect(result.exitCode).toBe(3);
    expect(lastJson(result.stderr)).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
        requestId: "req_401",
        statusCode: 401,
      },
    });
    const { error } = lastJson(result.stderr) as {
      error: Record<string, string>;
    };
    expect(error.fix).toContain("auth login");
    expect(error.docs).toMatch(HTTPS_URL);
  });
});
