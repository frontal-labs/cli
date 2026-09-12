import { describe, expect, it } from "vitest";
import { lastJson, mockApi, runCli } from "../helpers/cli.js";

describe("frontal events", () => {
  it("list/get/query/usage/reprocess hit the public /events endpoints", async () => {
    const mock = await mockApi([
      { body: { id: "evt_1" }, method: "GET", path: "/events/evt_1" },
      { body: { data: [], pagination: {} }, method: "GET", path: "/events" },
      { body: { data: [] }, method: "POST", path: "/events/query" },
      { body: { accepted: true }, method: "POST", path: "/events/usage" },
      { body: { queued: 1 }, method: "POST", path: "/events/reprocess" },
    ]);

    const list = await runCli(["events", "list", "--limit", "3", "--json"]);
    const get = await runCli(["events", "get", "evt_1", "--json"]);
    await runCli(["events", "query", "--body", '{"type":"x"}', "--json"]);
    await runCli(["events", "usage", "--body", '{"metric":"m"}', "--json"]);
    await runCli([
      "events",
      "reprocess",
      "--body",
      '{"ids":["evt_1"]}',
      "--json",
    ]);

    expect(list.exitCode).toBe(0);
    expect(mock.expectCalled("GET", "/events").url).toContain("limit=3");
    expect(get.exitCode).toBe(0);
    expect(lastJson(get.stdout)).toEqual({ id: "evt_1" });
    mock.expectCalledWith("POST", "/events/query", { type: "x" });
    mock.expectCalledWith("POST", "/events/usage", { metric: "m" });
    mock.expectCalledWith("POST", "/events/reprocess", { ids: ["evt_1"] });
  });

  it("rejects malformed --body JSON without calling the API", async () => {
    const mock = await mockApi([]);

    const result = await runCli([
      "events",
      "query",
      "--body",
      "{oops",
      "--json",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(mock.requests).toHaveLength(0);
    expect(lastJson(result.stderr).error).toMatchObject({
      message: "Invalid JSON for --body.",
    });
  });
});

describe("frontal runs / invocations", () => {
  it("runs list and create", async () => {
    const mock = await mockApi([
      { body: { data: [] }, method: "GET", path: "/runs" },
      { body: { id: "run_1" }, method: "POST", path: "/runs", status: 201 },
    ]);

    const list = await runCli(["runs", "list", "--cursor", "c1", "--json"]);
    const create = await runCli([
      "runs",
      "create",
      "--body",
      '{"workflowId":"wf_1"}',
      "--json",
    ]);

    expect(list.exitCode).toBe(0);
    expect(mock.expectCalled("GET", "/runs").url).toContain("cursor=c1");
    expect(create.exitCode).toBe(0);
    // The SDK sends snake_case on the wire; the mock records it back as camelCase.
    mock.expectCalledWith("POST", "/runs", { workflowId: "wf_1" });
    expect(lastJson(create.stdout)).toEqual({ id: "run_1" });
  });

  it("invocations create posts to /invocations", async () => {
    const mock = await mockApi([
      {
        body: { id: "inv_1" },
        method: "POST",
        path: "/invocations",
        status: 202,
      },
    ]);

    const result = await runCli([
      "invocations",
      "create",
      "--body",
      '{"target":"agent_1","input":{}}',
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    mock.expectCalledWith("POST", "/invocations", {
      input: {},
      target: "agent_1",
    });
  });
});

describe("secret redaction in command output", () => {
  it("masks API keys and tokens returned by the API", async () => {
    await mockApi([
      {
        body: {
          api_key: "frt_live_do_not_leak_me",
          id: "evt_1",
          note: "created with frt_live_do_not_leak_me",
        },
        method: "GET",
        path: "/events/evt_1",
      },
    ]);

    const result = await runCli(["events", "get", "evt_1", "--json"]);

    const text = result.stdout.join("\n");
    expect(text).not.toContain("frt_live_do_not_leak_me");
    expect(lastJson(result.stdout)).toMatchObject({
      apiKey: "[REDACTED]",
      note: "created with frt_[REDACTED]",
    });
  });
});
