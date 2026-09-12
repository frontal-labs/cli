import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockFetch, type MockRoute } from "@frontal-labs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initProject } from "@/commands/init.js";
import { PROXY_HEADER, serviceForPath } from "@/lib/dev/proxy.js";
import { compilePath, Router } from "@/lib/dev/router.js";
import { DevServer } from "@/lib/dev/server.js";
import { TEST_API_KEY } from "./helpers/cli.js";

type Sdk = import("@frontal-labs/sdk").Frontal;

const NUMERIC_ID = /^\/x\/(?<id>\d+)$/;
const DEV_REQUEST_ID = /^req_dev_/;
const AGENT_ID = /^agt_/;
const UNKNOWN_SERVICE = /Unknown service "nope"/;

async function sdkFor(baseUrl: string): Promise<Sdk> {
  const { Frontal, FrontalClient } = await import("@frontal-labs/sdk");
  const { clientConfigSchema } = await import("@frontal-labs/core");
  const client = new FrontalClient(
    clientConfigSchema.parse({ apiKey: TEST_API_KEY, baseUrl, maxRetries: 0 })
  );
  return new Frontal(client);
}

let root: string;
let server: DevServer | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-dev-"));
  initProject(root, {});
});

afterEach(async () => {
  await server?.stop();
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

async function startDev(
  options: Partial<ConstructorParameters<typeof DevServer>[0]> = {}
): Promise<{ sdk: Sdk; url: string }> {
  server = new DevServer({
    root,
    port: 0,
    globalOpts: {},
    watch: false,
    ...options,
  });
  const info = await server.start();
  return { url: info.url, sdk: await sdkFor(`${info.url}/v1`) };
}

describe("router", () => {
  it("matches {param} segments, wildcards and suffixes", () => {
    expect(compilePath("/agents/{id}")("/v1/agents/agt_1")).toEqual({
      id: "agt_1",
    });
    expect(compilePath("/agents/{id}")("/agents/runs/run_1")).toBeUndefined();
    expect(
      compilePath("/blob/object/{bucket}/*")("/blob/object/docs/a/b.txt")
    ).toEqual({
      bucket: "docs",
      "*": "a/b.txt",
    });
    expect(compilePath(NUMERIC_ID)("/x/42")).toEqual({ id: "42" });
  });

  it("honours `times` and route order", () => {
    const router = new Router([
      {
        method: "GET",
        path: "/a",
        times: 1,
        handler: () => new Response("first"),
      },
      { method: "GET", path: "/a", handler: () => new Response("second") },
    ]);
    expect(router.match("get", "/a")?.route.handler).toBeDefined();
    const again = router.match("GET", "/v1/a");
    expect(again).toBeDefined();
    expect(router.match("POST", "/a")).toBeUndefined();
  });

  it("maps paths to services by longest prefix", () => {
    expect(serviceForPath("/agents/x")).toBe("agents");
    expect(serviceForPath("/ontology/graph/entities")).toBe("graph");
    expect(serviceForPath("/ontology/schemas")).toBe("ontology");
    expect(serviceForPath("/data/ingest/datasets")).toBe("datasets");
    expect(serviceForPath("/nope")).toBeUndefined();
  });
});

describe("frontal dev server", () => {
  it("serves /health without auth and reports service modes", async () => {
    const { url } = await startDev();
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toMatch(DEV_REQUEST_ID);
    expect(await res.json()).toMatchObject({
      ok: true,
      services: { ai: "local", agents: "local", graph: "local" },
    });
  });

  it("runs the real SDK agents flow against local fixtures and persists state", async () => {
    const { sdk } = await startDev();

    const agent = await sdk.agents.create({
      name: "triage",
      triggers: [{ event: "ticket.created" }],
    } as Parameters<typeof sdk.agents.create>[0]);
    expect(agent.id).toMatch(AGENT_ID);
    expect(agent.status).toBe("active");

    const listed = await sdk.agents.list({ limit: 10 });
    expect(listed.data.map((a) => a.id)).toContain(agent.id);
    expect(listed.pagination.hasMore).toBe(false);

    const updated = await sdk.agents
      .use(agent.id)
      .update({ description: "v2" });
    expect(updated.version).toBe(2);
    expect((await sdk.agents.use(agent.id).versions()).data).toHaveLength(2);

    const rolled = await sdk.agents.use(agent.id).rollback({ toVersion: 1 });
    expect((rolled as { rolledBackTo?: number }).rolledBackTo).toBe(1);

    const run = await sdk.agents
      .use(agent.id)
      .message("ticket.created", { id: 1 });
    expect(run.status).toBe("completed");
    const events: string[] = [];
    for await (const event of sdk.agents.use(agent.id).watch(run.id)) {
      events.push(event.type);
    }
    expect(events).toEqual(["status", "step", "status", "done"]);

    // State is on disk under .frontal/state and survives a restart.
    expect(
      existsSync(join(root, ".frontal", "state", "agents", `${agent.id}.json`))
    ).toBe(true);
    await server?.stop();
    const restarted = await startDev();
    expect((await restarted.sdk.agents.use(agent.id).get()).id).toBe(agent.id);
  });

  it("raises SDK-typed errors for unknown resources and unsupported paths", async () => {
    const { sdk, url } = await startDev();
    const { NotFoundError } = await import("@frontal-labs/core");

    await expect(sdk.agents.use("agt_missing").get()).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(sdk.agents.use("agt_missing").get()).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });

    const res = await fetch(`${url}/v1/pipelines/x`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      code: "NOT_FOUND",
      fix: expect.stringContaining("--remote pipelines"),
    });
  });

  it("supports graph, blob and observability through the SDK", async () => {
    const { sdk } = await startDev();

    const acme = await sdk.graph
      .use("customer")
      .create({ name: "ACME", tier: 3 });
    await sdk.graph.use("customer").create({ name: "Globex", tier: 1 });
    const byName = await sdk.graph.query({
      entityType: "customer",
      conditions: { name: "ACME" },
    });
    expect(byName.data.map((e) => e.id)).toEqual([acme.id]);
    const byTier = await sdk.graph
      .use("customer")
      .query()
      .where({ tier: { gte: 2 } })
      .execute();
    expect(byTier.data).toHaveLength(1);
    await sdk.graph.use("customer").delete(acme.id);
    expect((await sdk.graph.use("customer").list()).data).toHaveLength(1);

    await sdk.blob.upload({
      bucket: "docs",
      key: "a/hello.txt",
      data: Buffer.from("hello"),
      contentType: "text/plain",
    });
    expect(
      await (
        await sdk.blob.download({ bucket: "docs", key: "a/hello.txt" })
      ).text()
    ).toBe("hello");
    const listed = (await sdk.blob.list({ bucket: "docs", prefix: "a/" })) as {
      objects: { key: string }[];
    };
    expect(listed.objects.map((o) => o.key)).toEqual(["a/hello.txt"]);
    await sdk.blob.delete({ bucket: "docs", key: "a/hello.txt" });

    const logs = await sdk.observability.logs.query({
      query: "blob",
      timeFrom: "-1h",
      timeTo: "now",
      limit: 5,
    });
    expect(logs.data.length).toBeGreaterThan(0);
    expect((logs.data[0] as { message: string }).message).toContain(
      "/blob/object"
    );
  });

  it("streams the dev server's request log over SSE", async () => {
    const { sdk } = await startDev();
    const stream = sdk.observability.logs.stream({
      query: "agents",
      timeFrom: "-1h",
      timeTo: "now",
    });
    const iterator = stream[Symbol.asyncIterator]();
    const first = iterator.next();
    // Give the subscription a moment to attach, then trigger a request.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await sdk.agents.list();
    const event = await first;
    expect(event.done).toBe(false);
    expect(event.value.type).toBe("log");
    expect((event.value.data as { message: string }).message).toContain(
      "GET /agents"
    );
    await iterator.return?.();
  });

  it("scenario routes override built-ins and respect `times`", async () => {
    const scenarios = join(root, ".frontal", "scenarios");
    mkdirSync(scenarios, { recursive: true });
    writeFileSync(
      join(scenarios, "outage.json"),
      JSON.stringify({
        routes: [
          {
            method: "GET",
            path: "/agents",
            times: 1,
            status: 503,
            body: {
              code: "SERVICE_UNAVAILABLE",
              message: "down",
              requestId: "req_scn",
            },
          },
          {
            method: "POST",
            path: "/access/check",
            body: { allowed: false, reason: "frozen" },
          },
        ],
      })
    );
    const { sdk } = await startDev({ scenario: "outage" });
    const { ServiceError } = await import("@frontal-labs/core");

    await expect(sdk.agents.list()).rejects.toBeInstanceOf(ServiceError);
    expect((await sdk.agents.list()).data).toEqual([]);
    expect(
      await sdk.governance.access.check({
        userId: "u",
        roleNames: ["dev"],
        action: "deploy",
      })
    ).toMatchObject({ allowed: false, reason: "frozen" });
  });

  it("rejects unknown scenarios and services with fix hints", async () => {
    server = new DevServer({
      root,
      port: 0,
      globalOpts: {},
      watch: false,
      scenario: "missing",
    });
    await expect(server.start()).rejects.toMatchObject({
      code: "SCENARIO_NOT_FOUND",
    });
    server = new DevServer({
      root,
      port: 0,
      globalOpts: {},
      watch: false,
      remote: ["nope"],
    });
    await expect(server.start()).rejects.toThrow(UNKNOWN_SERVICE);
  });

  it("proxies --remote services through the SDK and keeps the rest local", async () => {
    const upstream = createMockFetch([
      {
        method: "GET",
        path: "/workflows",
        body: {
          data: [{ id: "wf_1", name: "remote" }],
          pagination: { cursor: "c", has_more: false },
        },
        headers: { "x-request-id": "req_upstream" },
      },
      { method: "POST", path: "/workflows/search", body: { results: ["r"] } },
      { method: "DELETE", path: "/workflows/wf_1", status: 204 },
      {
        method: "GET",
        path: "/workflows/missing",
        status: 404,
        body: { code: "NOT_FOUND", message: "gone", requestId: "req_404" },
      },
    ] satisfies MockRoute[]);
    const sdkModule = await import("@/lib/sdk.js");
    vi.spyOn(sdkModule, "getSdk").mockImplementation(() =>
      sdkModule.createSdkHandle({
        credential: { kind: "api-key", apiKey: "frt_remote_key_000000" },
        baseUrl: "https://api.test.frontal.dev/v1",
        fetch: upstream.fetch,
        maxRetries: 0,
      })
    );

    const { sdk, url } = await startDev({ remote: ["workflows"] });
    expect(server?.services).toMatchObject({
      workflows: "remote",
      agents: "local",
    });

    const page = await sdk.workflows.list();
    expect(page.data[0]?.name).toBe("remote");
    const forwarded = upstream.expectCalled("GET", "/workflows");
    expect(forwarded.headers[PROXY_HEADER]).toBe("workflows");
    expect(forwarded.headers.authorization).toBe(
      "Bearer frt_remote_key_000000"
    );

    const raw = await fetch(`${url}/v1/workflows`);
    expect(raw.headers.get(PROXY_HEADER)).toBe("1");
    expect(raw.headers.get("x-request-id")).toBe("req_upstream");

    // Non-streaming methods go through the SDK's typed helpers.
    const deleted = await fetch(`${url}/v1/workflows/wf_1`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(204);
    upstream.expectCalled("DELETE", "/workflows/wf_1");

    // Upstream errors are re-emitted as SDK-shaped error envelopes.
    const missing = await fetch(`${url}/v1/workflows/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      code: "NOT_FOUND",
      requestId: "req_404",
      service: "workflows",
    });

    // Local services never touch the upstream.
    await sdk.agents.list();
    expect(upstream.callCount("GET", "/agents")).toBe(0);
  });

  it("answers 503 NO_CREDENTIALS for remote services without a key", async () => {
    const { url } = await startDev({ remote: ["graph"] });
    const res = await fetch(`${url}/v1/ontology/graph/entities`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: "NO_CREDENTIALS",
      fix: expect.stringContaining("frontal auth login"),
    });
  });

  it("reloads the route table when scenario or config files change", async () => {
    const scenarios = join(root, ".frontal", "scenarios");
    mkdirSync(scenarios, { recursive: true });
    const file = join(scenarios, "live.json");
    writeFileSync(file, JSON.stringify({ routes: [] }));
    const reloads: string[] = [];
    const { url } = await startDev({
      scenario: "live",
      watch: true,
      onReload: (info) => reloads.push(info.reason),
    });
    expect((await (await fetch(`${url}/v1/agents/health`)).json()).status).toBe(
      "ok"
    );

    writeFileSync(
      file,
      JSON.stringify({
        routes: [
          {
            method: "GET",
            path: "/agents/health",
            body: { status: "scenario" },
          },
        ],
      })
    );
    // fs.watch latency varies by platform/load; the polling fallback fires within ~300ms.
    await vi.waitFor(() => expect(reloads).toContain("live.json"), {
      timeout: 8000,
      interval: 100,
    });
    expect((await (await fetch(`${url}/v1/agents/health`)).json()).status).toBe(
      "scenario"
    );

    // A broken config keeps the previous table.
    const config = join(root, "frontal.jsonc");
    writeFileSync(config, '{ "name": "x", "services": { "bogus": {} } }');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect((await (await fetch(`${url}/v1/agents/health`)).json()).status).toBe(
      "scenario"
    );
  });
});
