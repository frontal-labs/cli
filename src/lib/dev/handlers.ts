import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { FrontalError } from "@frontal-labs/error";
import { errorResponse } from "@frontal-labs/error/server";
import { z } from "zod";
import {
  agentRecord,
  agentVersionRecord,
  datasetRecord,
  entityRecord,
  executionRecord,
  logEntry,
  newId,
  nowIso,
  page,
  policyRecord,
} from "@/lib/dev/fixtures.js";
import type { DevRequest, RouteDefinition } from "@/lib/dev/router.js";
import {
  isJsonRecord,
  jsonArray,
  jsonField,
  jsonNumber,
  jsonObject,
  jsonRecordArray,
  jsonString,
  jsonStringArray,
} from "@/lib/json.js";
import type { ProjectState } from "@/lib/state.js";
import { VERSION } from "@/version.js";

type Obj = Record<string, unknown>;

export interface LocalContext {
  env: string;
  /** Subscribers for `GET /observability/logs/stream`. */
  logSubscribers: Set<(entry: Obj) => void>;
  /** Ring buffer of request log lines exposed through the observability routes. */
  logs: Obj[];
  services: Record<string, "local" | "remote">;
  startedAt: number;
  state: ProjectState;
}

export const DOCS_URL = "https://frontal.dev/docs/cli/dev";
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    status,
  });
}

/** A field-level validation problem, as the SDK's `ValidationError` reads it. */
export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorOptions {
  fields?: FieldError[] | undefined;
  fix?: string | undefined;
}

/**
 * A local API error. The body and format come from the error library, so
 * SDK clients get the JSON envelope and curl users get readable ANSI text.
 * The library only sends `public` text, so `fields` is added to the JSON
 * envelope here; ANSI responses carry the message and fix only.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
  req: Pick<DevRequest, "headers" | "requestId">,
  options: ApiErrorOptions = {}
): Response {
  const error = new FrontalError(message, {
    code,
    public: {
      link: `${DOCS_URL}#${code.toLowerCase()}`,
      message,
      ...(options.fix ? { fix: options.fix } : {}),
    },
    scope: "dev",
    statusCode: toErrorStatus(status),
  });
  const response = errorResponse(error, { request: req.headers });
  return new Response(withFields(response.body, options.fields), {
    headers: { ...response.headers, "x-request-id": req.requestId },
    status: response.status,
  });
}

/** The library only accepts 400–599; anything else becomes a 500. */
function toErrorStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500;
}

function withFields(body: string, fields: FieldError[] | undefined): string {
  if (fields === undefined || !body.startsWith("{")) {
    return body;
  }
  const parsed = JSON.parse(body) as { error: Record<string, unknown> };
  return JSON.stringify({ error: { ...parsed.error, fields } });
}

function notFound(req: DevRequest, what: string): Response {
  return apiError(404, "NOT_FOUND", `${what} not found`, req);
}

/** A route parameter. The router only calls a handler with the params it matched. */
function pathParam(req: DevRequest, name: string): string {
  const value = req.params[name];
  if (value === undefined) {
    throw new Error(`Missing route parameter "${name}".`);
  }
  return value;
}

function bodyObject(req: DevRequest): Obj {
  return isJsonRecord(req.body) ? req.body : {};
}

function pageOptions(req: DevRequest): {
  cursor?: string | undefined;
  limit?: number | undefined;
} {
  const limit = req.query.get("limit");
  return {
    cursor: req.query.get("cursor") ?? undefined,
    limit: limit ? Number(limit) : undefined,
  };
}

/** Emits a log entry to the in-memory buffer and any live subscribers. */
export function emitLog(ctx: LocalContext, entry: Obj): void {
  ctx.logs.push(entry);
  if (ctx.logs.length > 1000) {
    ctx.logs.shift();
  }
  for (const subscriber of ctx.logSubscribers) {
    subscriber(entry);
  }
}

function sseResponse(
  events: AsyncIterable<{ data: unknown; event?: string; id?: string }>,
  requestId: string
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          const lines = [
            event.id ? `id: ${event.id}` : undefined,
            event.event ? `event: ${event.event}` : undefined,
            `data: ${JSON.stringify(event.data)}`,
          ].filter(Boolean);
          controller.enqueue(encoder.encode(`${lines.join("\n")}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
      "x-request-id": requestId,
    },
  });
}

function once(
  items: { data: unknown; event?: string; id?: string }[]
): AsyncIterable<{ data: unknown; event?: string; id?: string }> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        // biome-ignore lint/performance/noAwaitInLoops: emits events in order
        yield await Promise.resolve(item);
      }
    },
  };
}

function healthRoutes(ctx: LocalContext): RouteDefinition[] {
  const health = (): Response =>
    json({
      env: ctx.env,
      ok: true,
      services: ctx.services,
      status: "ok",
      uptime_ms: Date.now() - ctx.startedAt,
      version: VERSION,
    });
  return [
    { handler: health, method: "GET", path: "/health", service: "dev" },
    {
      handler: health,
      method: "GET",
      path: "/agents/health",
      service: "agents",
    },
    {
      handler: health,
      method: "GET",
      path: "/ontology/graph/health",
      service: "graph",
    },
  ];
}

function agentRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const load = (id: string): Obj | undefined => state.read("agents", id);
  const save = (agent: Obj): void =>
    state.write("agents", String(jsonField(agent, "id")), agent);
  const versionsOf = (agent: Obj): Obj[] => {
    const count = Number(jsonField(agent, "version") ?? 1);
    return Array.from({ length: count }, (_, i) =>
      agentVersionRecord(agent, i + 1)
    ).reverse();
  };

  return [
    {
      handler: (req) => {
        let agents = state.list("agents");
        const status = req.query.get("status");
        if (status) {
          agents = agents.filter((a) => jsonField(a, "status") === status);
        }
        return json(page(agents, pageOptions(req)));
      },
      method: "GET",
      path: "/agents",
      service: "agents",
    },
    {
      handler: (req) => {
        const definition = bodyObject(req);
        const definitionName = jsonString(definition, "name");
        if (definitionName === undefined || definitionName.length === 0) {
          return apiError(400, "VALIDATION_ERROR", "name is required", req, {
            fields: [{ field: "name", message: "Required" }],
          });
        }
        const agent = agentRecord(definition, { environment: ctx.env });
        save(agent);
        return json(agent, 201);
      },
      method: "POST",
      path: "/agents",
      service: "agents",
    },
    {
      handler: (req) => {
        const run = state.read("runs", pathParam(req, "runId"));
        return run
          ? json({ messages: [{ content: "local dev run", role: "system" }] })
          : notFound(req, `Run ${pathParam(req, "runId")}`);
      },
      method: "GET",
      path: "/agents/runs/{runId}/conversation",
      service: "agents",
    },
    {
      handler: (req) => {
        const run = state.read("runs", pathParam(req, "runId"));
        if (!run) {
          return notFound(req, `Run ${pathParam(req, "runId")}`);
        }
        return sseResponse(
          once([
            {
              data: { run_id: jsonField(run, "id"), status: "running" },
              event: "status",
            },
            { data: { step: 1, type: "observe" }, event: "step" },
            {
              data: {
                run_id: jsonField(run, "id"),
                status: jsonField(run, "status"),
              },
              event: "status",
            },
            { data: run, event: "done" },
          ]),
          req.requestId
        );
      },
      method: "GET",
      path: "/agents/runs/{runId}/stream",
      service: "agents",
    },
    {
      handler: (req) => {
        const run = state.read("runs", pathParam(req, "runId"));
        return run
          ? json(run)
          : notFound(req, `Run ${pathParam(req, "runId")}`);
      },
      method: "GET",
      path: "/agents/runs/{runId}",
      service: "agents",
    },
    {
      handler: (req) => {
        const agent = load(pathParam(req, "id"));
        return agent
          ? json(page(versionsOf(agent), pageOptions(req)))
          : notFound(req, `Agent ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/agents/{id}/versions",
      service: "agents",
    },
    {
      handler: (req) => {
        const agent = load(pathParam(req, "id"));
        if (!agent) {
          return notFound(req, `Agent ${pathParam(req, "id")}`);
        }
        const body = bodyObject(req);
        const current = Number(jsonField(agent, "version") ?? 1);
        const target = jsonNumber(body, "to_version") ?? current - 1;
        if (target < 1 || target > current) {
          return apiError(
            400,
            "VALIDATION_ERROR",
            `Cannot roll back agent ${jsonField(agent, "id")} to version ${target}`,
            req,
            {
              fields: [
                {
                  field: "toVersion",
                  message: `Must be between 1 and ${current}`,
                },
              ],
            }
          );
        }
        const rolledBack = {
          ...agent,
          rolled_back_from: current,
          rolled_back_to: target,
          updated_at: nowIso(),
          version: current + 1,
        };
        save(rolledBack);
        return json(rolledBack);
      },
      method: "POST",
      path: "/agents/{id}/rollback",
      service: "agents",
    },
    {
      handler: (req) => {
        const agent = load(pathParam(req, "id"));
        if (!agent) {
          return notFound(req, `Agent ${pathParam(req, "id")}`);
        }
        const runs = state
          .list("runs")
          .filter((r) => jsonField(r, "agent_id") === jsonField(agent, "id"));
        return json(page(runs, pageOptions(req)));
      },
      method: "GET",
      path: "/agents/{id}/runs",
      service: "agents",
    },
    {
      handler: (req) => {
        const agent = load(pathParam(req, "id"));
        if (!agent) {
          return notFound(req, `Agent ${pathParam(req, "id")}`);
        }
        const body = bodyObject(req);
        const run = executionRecord(
          String(jsonField(agent, "id")),
          String(jsonField(body, "event") ?? "manual"),
          jsonObject(body, "payload") ?? {}
        );
        state.write("runs", String(jsonField(run, "id")), run);
        emitLog(
          ctx,
          logEntry(
            "info",
            `agent ${jsonField(agent, "name")} handled ${jsonField(run, "trigger_event")}`,
            {
              agent_id: jsonField(agent, "id"),
              run_id: jsonField(run, "id"),
            }
          )
        );
        return json(run, 202);
      },
      method: "POST",
      path: "/agents/{id}/runs",
      service: "agents",
    },
    {
      handler: (req) => {
        const agent = load(pathParam(req, "id"));
        return agent
          ? json(agent)
          : notFound(req, `Agent ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/agents/{id}",
      service: "agents",
    },
    {
      handler: (req) => {
        const agent = load(pathParam(req, "id"));
        if (!agent) {
          return notFound(req, `Agent ${pathParam(req, "id")}`);
        }
        const updated = {
          ...agent,
          ...bodyObject(req),
          id: jsonField(agent, "id"),
          updated_at: nowIso(),
          version: Number(jsonField(agent, "version") ?? 1) + 1,
        };
        save(updated);
        return json(updated);
      },
      method: "PUT",
      path: "/agents/{id}",
      service: "agents",
    },
    {
      handler: (req) =>
        state.remove("agents", pathParam(req, "id"))
          ? new Response(null, { status: 204 })
          : notFound(req, `Agent ${pathParam(req, "id")}`),
      method: "DELETE",
      path: "/agents/{id}",
      service: "agents",
    },
  ];
}

function graphRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const entities = (): Obj[] =>
    state
      .list("graph")
      .filter((r) => String(jsonField(r, "id")).startsWith("ent_"));
  const load = (id: string): Obj | undefined => state.read("graph", id);

  const matches = (entity: Obj, conditions: Obj): boolean => {
    const fields = jsonObject(entity, "fields") ?? {};
    return Object.entries(conditions).every(([key, expected]) => {
      const actual = key === "type" ? jsonField(entity, "type") : fields[key];
      if (key === "type" && jsonField(entity, "type") === null) {
        return true;
      }
      return matchesFilter(actual, expected);
    });
  };

  const queryHandler = (req: DevRequest): Response => {
    const body = bodyObject(req);
    const conditions =
      jsonObject(body, "conditions") ?? jsonObject(body, "filter") ?? {};
    const entityType =
      jsonField(body, "entity_type") ?? jsonField(body, "type");
    // Entities created via `use(type).create()` carry no type on the wire;
    // they match any entity_type filter.
    const results = entities().filter(
      (e) =>
        (entityType && jsonField(e, "type") !== null
          ? jsonField(e, "type") === entityType
          : true) && matches(e, conditions)
    );
    return json(
      page(results, {
        cursor: jsonString(body, "cursor"),
        limit: jsonNumber(body, "limit"),
      })
    );
  };

  return [
    {
      handler: () => json({ entities: entities().length, name: "frontal-dev" }),
      method: "GET",
      path: "/ontology/graph/info",
      service: "graph",
    },
    {
      handler: () =>
        json({ neighborhood: true, path: true, query: true, semantic: false }),
      method: "GET",
      path: "/ontology/graph/capabilities",
      service: "graph",
    },
    {
      handler: (req) => {
        const conditions = req.query.get("conditions");
        let items = entities();
        if (conditions) {
          try {
            const parsed: unknown = JSON.parse(conditions);
            const conditionsObject: Obj = isJsonRecord(parsed) ? parsed : {};
            items = items.filter((e) => matches(e, conditionsObject));
          } catch {
            return apiError(
              400,
              "VALIDATION_ERROR",
              "conditions must be JSON",
              req
            );
          }
        }
        return json(page(items, pageOptions(req)));
      },
      method: "GET",
      path: "/ontology/graph/entities",
      service: "graph",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const fields = jsonObject(body, "fields") ?? body;
        const entity = entityRecord(fields);
        state.write("graph", String(jsonField(entity, "id")), entity);
        return json(entity, 201);
      },
      method: "POST",
      path: "/ontology/graph/entities",
      service: "graph",
    },
    {
      handler: (req) => {
        const entity = load(pathParam(req, "id"));
        if (!entity) {
          return notFound(req, `Entity ${pathParam(req, "id")}`);
        }
        const links = state
          .list("graph")
          .filter(
            (r) =>
              String(jsonField(r, "id")).startsWith("rel_") &&
              jsonField(r, "from_id") === jsonField(entity, "id")
          );
        return json({
          data: links,
          entity_id: jsonField(entity, "id"),
          history: [
            {
              change: "created",
              changed_at: jsonField(entity, "created_at"),
              version: 1,
            },
          ],
        });
      },
      method: "GET",
      path: "/ontology/graph/entities/{id}/provenance",
      service: "graph",
    },
    {
      handler: (req) => {
        const entity = load(pathParam(req, "id"));
        if (!entity) {
          return notFound(req, `Entity ${pathParam(req, "id")}`);
        }
        const body = bodyObject(req);
        const relationship = {
          created_at: nowIso(),
          fields: jsonObject(body, "fields") ?? {},
          from_id: jsonField(entity, "id"),
          id: newId("rel"),
          to_id:
            jsonField(body, "target_id") ??
            jsonField(body, "to_id") ??
            jsonField(body, "entity_id"),
          type:
            jsonField(body, "type") ??
            jsonField(body, "relationship") ??
            "related",
        };
        state.write("graph", String(relationship.id), relationship);
        return json(relationship, 201);
      },
      method: "POST",
      path: "/ontology/graph/entities/{id}/provenance",
      service: "graph",
    },
    {
      handler: (req) => {
        const entity = load(pathParam(req, "id"));
        return entity
          ? json(entity)
          : notFound(req, `Entity ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/ontology/graph/entities/{id}",
      service: "graph",
    },
    {
      handler: (req) => {
        const entity = load(pathParam(req, "id"));
        if (!entity) {
          return notFound(req, `Entity ${pathParam(req, "id")}`);
        }
        const body = bodyObject(req);
        const updated = {
          ...entity,
          fields: {
            ...jsonObject(entity, "fields"),
            ...(jsonObject(body, "fields") ?? {}),
          },
          updated_at: nowIso(),
          version: Number(jsonField(entity, "version") ?? 1) + 1,
        };
        state.write("graph", String(jsonField(entity, "id")), updated);
        return json(updated);
      },
      method: "PUT",
      path: "/ontology/graph/entities/{id}",
      service: "graph",
    },
    {
      handler: (req) =>
        state.remove("graph", pathParam(req, "id"))
          ? new Response(null, { status: 204 })
          : notFound(req, `Entity ${pathParam(req, "id")}`),
      method: "DELETE",
      path: "/ontology/graph/entities/{id}",
      service: "graph",
    },
    {
      handler: (req) => {
        const rel = load(pathParam(req, "id"));
        return rel
          ? json(rel)
          : notFound(req, `Relationship ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/ontology/graph/relationships/{id}",
      service: "graph",
    },
    {
      handler: (req) =>
        state.remove("graph", pathParam(req, "id"))
          ? new Response(null, { status: 204 })
          : notFound(req, `Relationship ${pathParam(req, "id")}`),
      method: "DELETE",
      path: "/ontology/graph/relationships/{id}",
      service: "graph",
    },
    {
      handler: queryHandler,
      method: "POST",
      path: "/ontology/graph/graph/query",
      service: "graph",
    },
    {
      handler: (req) => {
        const ids = jsonStringArray(bodyObject(req), "ids");
        return json({ data: ids.map((id) => load(id)).filter(Boolean) });
      },
      method: "POST",
      path: "/ontology/graph/graph/bulk-read",
      service: "graph",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const startId = String(
          jsonField(body, "start_id") ??
            jsonField(body, "entity_id") ??
            jsonField(body, "id") ??
            ""
        );
        const start = load(startId);
        if (!start) {
          return notFound(req, `Entity ${startId || "(missing start_id)"}`);
        }
        const rels = state
          .list("graph")
          .filter(
            (r) =>
              String(jsonField(r, "id")).startsWith("rel_") &&
              jsonField(r, "from_id") === jsonField(start, "id")
          );
        const nodes = [
          start,
          ...rels
            .map((r) => load(String(jsonField(r, "to_id"))))
            .filter(Boolean),
        ];
        return json({ data: nodes, edges: rels, nodes, results: nodes });
      },
      method: "POST",
      path: "/ontology/graph/graph/neighborhood",
      service: "graph",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const from = load(
          String(
            jsonField(body, "from_id") ?? jsonField(body, "start_id") ?? ""
          )
        );
        const to = load(
          String(jsonField(body, "to_id") ?? jsonField(body, "end_id") ?? "")
        );
        if (!(from && to)) {
          return notFound(req, "Path endpoints");
        }
        const direct = state
          .list("graph")
          .find(
            (r) =>
              String(jsonField(r, "id")).startsWith("rel_") &&
              jsonField(r, "from_id") === jsonField(from, "id") &&
              jsonField(r, "to_id") === jsonField(to, "id")
          );
        return json({
          edges: direct ? [direct] : [],
          found: Boolean(direct),
          length: direct ? 1 : 0,
          path: direct ? [from, to] : [],
        });
      },
      method: "POST",
      path: "/ontology/graph/graph/path",
      service: "graph",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        return json({
          answer: `Local dev graph has ${entities().length} entities.`,
          data: entities().slice(0, 10),
          question: jsonField(body, "question") ?? jsonField(body, "query"),
        });
      },
      method: "POST",
      path: "/ontology/graph/graph/analyze",
      service: "graph",
    },
  ];
}

function datasetRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const datasets = (): Obj[] => state.list("datasets");
  const catalog = (ds: Obj): Obj => ({ ...ds, source: "local" });

  return [
    {
      handler: (req) => json(page(datasets(), pageOptions(req))),
      method: "GET",
      path: "/data/ingest/datasets",
      service: "datasets",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const datasetId = jsonString(body, "dataset_id");
        const existing =
          datasetId === undefined
            ? undefined
            : state.read("datasets", datasetId);
        const rows = jsonArray(body, "rows") ?? [];
        const dataset = existing
          ? {
              ...existing,
              row_count:
                Number(jsonField(existing, "row_count") ?? 0) + rows.length,
              updated_at: nowIso(),
            }
          : datasetRecord(body);
        state.write("datasets", String(jsonField(dataset, "id")), dataset);
        return json(
          {
            dataset,
            dataset_id: jsonField(dataset, "id"),
            ingested: rows.length,
          },
          202
        );
      },
      method: "POST",
      path: "/data/ingest/datasets/ingest",
      service: "datasets",
    },
    {
      handler: (req) => {
        const ds = state.read("datasets", pathParam(req, "id"));
        return ds ? json(ds) : notFound(req, `Dataset ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/data/ingest/datasets/{id}",
      service: "datasets",
    },
    {
      handler: (req) => json(page([], pageOptions(req))),
      method: "GET",
      path: "/data/ingest/schemas",
      service: "datasets",
    },
    {
      handler: (req) => json(page(datasets().map(catalog), pageOptions(req))),
      method: "GET",
      path: "/data/catalog/catalog/datasets",
      service: "datasets",
    },
    {
      handler: (req) => {
        const ds = state.read("datasets", pathParam(req, "id"));
        return ds
          ? json(catalog(ds))
          : notFound(req, `Dataset ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/data/catalog/catalog/datasets/{id}",
      service: "datasets",
    },
    {
      handler: (req) =>
        json(
          page(
            [{ id: "src_local", name: "local", type: "dev" }],
            pageOptions(req)
          )
        ),
      method: "GET",
      path: "/data/catalog/catalog/sources",
      service: "datasets",
    },
  ];
}

const blobMetaSchema = z
  .object({
    bucket: z.string(),
    content_type: z.string(),
    created_at: z.string(),
    file: z.string(),
    key: z.string(),
    size: z.number(),
  })
  .loose();

type BlobMeta = z.infer<typeof blobMetaSchema>;

function parseBlobMeta(value: unknown): BlobMeta | undefined {
  const parsed = blobMetaSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function blobRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const blobDir = join(state.baseDir, "blob", "objects");
  const metaId = (bucket: string, key: string): string =>
    createHash("sha1").update(`${bucket}/${key}`).digest("hex");
  const meta = (bucket: string, key: string): BlobMeta | undefined =>
    state.readAs("blob", metaId(bucket, key), parseBlobMeta);

  const objectPath = (req: DevRequest): { bucket: string; key: string } => ({
    bucket: pathParam(req, "bucket"),
    key: pathParam(req, "*"),
  });

  return [
    {
      handler: (req) => {
        const body = bodyObject(req);
        const prefix = jsonString(body, "prefix") ?? "";
        const objects = state
          .listAs("blob", parseBlobMeta)
          .filter(
            (m) =>
              m.bucket === pathParam(req, "bucket") && m.key.startsWith(prefix)
          )
          .map((m) => ({
            content_type: m.content_type,
            created_at: m.created_at,
            key: m.key,
            last_modified: m.created_at,
            name: m.key,
            size: m.size,
          }));
        return json({
          data: objects,
          has_more: false,
          objects,
          total: objects.length,
        });
      },
      method: "POST",
      path: "/blob/object/list/{bucket}",
      service: "blob",
    },
    {
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const { origin } = new URL(req.raw.url);
        return json({
          signed_url: `${origin}/v1/blob/object/${bucket}/${key}?token=dev`,
        });
      },
      method: "POST",
      path: "/blob/object/sign/{bucket}/*",
      service: "blob",
    },
    {
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const found = meta(bucket, key);
        return found
          ? json({
              content_type: found.content_type,
              created_at: found.created_at,
              key,
              size: found.size,
            })
          : notFound(req, `Object ${bucket}/${key}`);
      },
      method: "GET",
      path: "/blob/object/info/{bucket}/*",
      service: "blob",
    },
    {
      handler: (req) => copyOrMove(req, false),
      method: "POST",
      path: "/blob/object/copy",
      service: "blob",
    },
    {
      handler: (req) => copyOrMove(req, true),
      method: "POST",
      path: "/blob/object/move",
      service: "blob",
    },
    {
      handler: async (req) => {
        const { bucket, key } = objectPath(req);
        let bytes: Uint8Array;
        let contentType = "application/octet-stream";
        const incoming = req.headers.get("content-type") ?? "";
        if (incoming.startsWith("multipart/form-data")) {
          const form = await req.raw.formData();
          const file = form.get("file");
          if (!(file instanceof Blob)) {
            return apiError(
              400,
              "VALIDATION_ERROR",
              "multipart field `file` is required",
              req
            );
          }
          bytes = new Uint8Array(await file.arrayBuffer());
          contentType = file.type || contentType;
        } else {
          bytes =
            req.body instanceof Uint8Array
              ? req.body
              : new TextEncoder().encode(String(req.body ?? ""));
          contentType = incoming || contentType;
        }
        mkdirSync(blobDir, { recursive: true });
        const id = metaId(bucket, key);
        const file = join(blobDir, `${id}.bin`);
        writeFileSync(file, bytes);
        state.write("blob", id, {
          bucket,
          content_type: contentType,
          created_at: nowIso(),
          file,
          key,
          size: bytes.byteLength,
        } satisfies BlobMeta);
        return json(
          { content_type: contentType, key, size: bytes.byteLength },
          201
        );
      },
      method: "POST",
      path: "/blob/object/{bucket}/*",
      service: "blob",
    },
    {
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const found = meta(bucket, key);
        if (!(found && existsSync(found.file))) {
          return notFound(req, `Object ${bucket}/${key}`);
        }
        return new Response(readFileSync(found.file), {
          headers: {
            "content-length": String(found.size),
            "content-type": found.content_type,
          },
        });
      },
      method: "GET",
      path: "/blob/object/{bucket}/*",
      service: "blob",
    },
    {
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const found = meta(bucket, key);
        if (!found) {
          return notFound(req, `Object ${bucket}/${key}`);
        }
        rmSync(found.file, { force: true });
        state.remove("blob", metaId(bucket, key));
        return new Response(null, { status: 204 });
      },
      method: "DELETE",
      path: "/blob/object/{bucket}/*",
      service: "blob",
    },
  ];

  function copyOrMove(req: DevRequest, move: boolean): Response {
    const body = bodyObject(req);
    const from = jsonField(body, "source") ?? jsonField(body, "from") ?? {};
    const to = jsonField(body, "destination") ?? jsonField(body, "to") ?? {};
    const src: Obj = isJsonRecord(from) ? from : {};
    const dst: Obj = isJsonRecord(to) ? to : {};
    const srcMeta = meta(
      String(jsonField(src, "bucket") ?? jsonField(body, "from_bucket")),
      String(jsonField(src, "key") ?? jsonField(body, "from_key"))
    );
    if (!(srcMeta && existsSync(srcMeta.file))) {
      return notFound(req, "Source object");
    }
    const dstBucket = String(
      jsonField(dst, "bucket") ?? jsonField(body, "to_bucket") ?? srcMeta.bucket
    );
    const dstKey = String(
      jsonField(dst, "key") ?? jsonField(body, "to_key") ?? srcMeta.key
    );
    const id = metaId(dstBucket, dstKey);
    const file = join(blobDir, `${id}.bin`);
    mkdirSync(blobDir, { recursive: true });
    writeFileSync(file, readFileSync(srcMeta.file));
    state.write("blob", id, {
      ...srcMeta,
      bucket: dstBucket,
      created_at: nowIso(),
      file,
      key: dstKey,
    });
    if (move) {
      rmSync(srcMeta.file, { force: true });
      state.remove("blob", metaId(srcMeta.bucket, srcMeta.key));
    }
    return json({ bucket: dstBucket, key: dstKey, moved: move });
  }
}

function observabilityRoutes(ctx: LocalContext): RouteDefinition[] {
  const filterLogs = (input: Obj): Obj[] => {
    const query = jsonString(input, "query")?.trim() ?? "";
    const level = jsonString(input, "level");
    const tokens: string[] =
      query === "" || query === "*" ? [] : query.split(WHITESPACE);
    return ctx.logs.filter((entry) => {
      if (level && jsonField(entry, "level") !== level) {
        return false;
      }
      return tokens.every((token) => matchesLogToken(entry, token));
    });
  };

  return [
    {
      handler: (req) => {
        const body = bodyObject(req);
        const entries = filterLogs(body);
        const ordered =
          jsonField(body, "order") === "asc" ? entries : [...entries].reverse();
        return json(
          page(ordered, {
            cursor: jsonString(body, "cursor"),
            limit: jsonNumber(body, "limit"),
          })
        );
      },
      method: "POST",
      path: "/observability/logs/query",
      service: "observability",
    },
    {
      handler: (req) => {
        const query = req.query.get("query") ?? "";
        const level = req.query.get("level") ?? undefined;
        const { signal } = req.raw;
        const events: AsyncIterable<{
          data: unknown;
          event?: string;
          id?: string;
        }> = {
          [Symbol.asyncIterator]() {
            const queue: Obj[] = [];
            let wake: (() => void) | undefined;
            const subscriber = (entry: Obj): void => {
              if (filterLogs({ level, query }).includes(entry)) {
                queue.push(entry);
                wake?.();
              }
            };
            ctx.logSubscribers.add(subscriber);
            const stop = (): void => {
              ctx.logSubscribers.delete(subscriber);
              wake?.();
            };
            signal.addEventListener("abort", stop, { once: true });
            return {
              async next() {
                while (queue.length === 0 && !signal.aborted) {
                  // biome-ignore lint/performance/noAwaitInLoops: waits for the next log entry
                  await new Promise<void>((resolve) => {
                    wake = resolve;
                  });
                  wake = undefined;
                }
                const entry = queue.shift();
                if (!entry) {
                  stop();
                  return { done: true, value: undefined };
                }
                return {
                  done: false,
                  value: {
                    data: entry,
                    event: "log",
                    id: String(jsonField(entry, "id")),
                  },
                };
              },
              return() {
                stop();
                return Promise.resolve({ done: true, value: undefined });
              },
            };
          },
        };
        return sseResponse(events, req.requestId);
      },
      method: "GET",
      path: "/observability/logs/stream",
      service: "observability",
    },
    {
      handler: (req) => {
        const entries = jsonRecordArray(bodyObject(req), "entries");
        for (const entry of entries) {
          emitLog(ctx, {
            id: newId("log"),
            service: "app",
            timestamp: nowIso(),
            ...entry,
          });
        }
        return json({ ingested: entries.length }, 202);
      },
      method: "POST",
      path: "/observability/logs/ingest",
      service: "observability",
    },
    {
      handler: () =>
        json({
          data: [
            {
              name: "frontal_dev_requests_total",
              unit: "count",
              value: ctx.logs.length,
            },
            {
              name: "frontal_dev_uptime_ms",
              unit: "ms",
              value: Date.now() - ctx.startedAt,
            },
          ],
        }),
      method: "GET",
      path: "/observability/metrics",
      service: "observability",
    },
    {
      handler: () =>
        json({ by_level: countBy(ctx.logs, "level"), total: ctx.logs.length }),
      method: "GET",
      path: "/observability/events/stats",
      service: "observability",
    },
  ];
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

/** Evaluates an SDK filter value (scalar or `{ eq, gt, in, contains, ... }`). */
function matchesFilter(actual: unknown, expected: unknown): boolean {
  if (!isJsonRecord(expected)) {
    return actual === expected;
  }
  const ops = expected;
  const text = String(actual ?? "");
  return Object.entries(ops).every(([op, value]) => {
    switch (op) {
      case "eq":
        return actual === value;
      case "ne":
        return actual !== value;
      case "gt":
        return compare(actual, value) > 0;
      case "gte":
        return compare(actual, value) >= 0;
      case "lt":
        return compare(actual, value) < 0;
      case "lte":
        return compare(actual, value) <= 0;
      case "in":
        return Array.isArray(value) && value.includes(actual);
      case "nin":
        return Array.isArray(value) && !value.includes(actual);
      case "contains":
        return text.includes(String(value));
      case "starts_with":
      case "startsWith":
        return text.startsWith(String(value));
      case "ends_with":
      case "endsWith":
        return text.endsWith(String(value));
      default:
        return false;
    }
  });
}

const WHITESPACE = /\s+/;

/**
 * Minimal log query language for local dev: `key:value` matches a top-level
 * or metadata field (`project:` always matches — dev serves one project),
 * anything else is a case-insensitive substring match.
 */
function matchesLogToken(entry: Obj, token: string): boolean {
  const colon = token.indexOf(":");
  if (colon > 0) {
    const key = token.slice(0, colon);
    const value = token.slice(colon + 1);
    if (key === "project") {
      return true;
    }
    const metadata = jsonObject(entry, "metadata") ?? {};
    const actual = entry[key] ?? metadata[key];
    if (actual !== undefined) {
      return String(actual) === value;
    }
  }
  return JSON.stringify(entry).toLowerCase().includes(token.toLowerCase());
}

function countBy(items: Obj[], key: string): Obj {
  const out: Obj = {};
  for (const item of items) {
    const value = String(item[key]);
    out[value] = Number(out[value] ?? 0) + 1;
  }
  return out;
}

function governanceRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const policies = (): Obj[] => state.list("policies");
  const denyRules = (): Obj[] =>
    policies().flatMap((p) => {
      const def = jsonObject(p, "definition") ?? {};
      const deny = jsonRecordArray(def, "deny");
      return deny.map((rule) => ({
        ...rule,
        policy_id: jsonField(p, "id"),
        policy_name: jsonField(p, "name"),
      }));
    });

  return [
    {
      handler: (req) =>
        json(
          page(
            [
              {
                definition_format: "json_schema",
                id: "tpl_deny_prod_without_review",
                name: "Require review before production deploys",
              },
            ],
            pageOptions(req)
          )
        ),
      method: "GET",
      path: "/policies/templates",
      service: "governance",
    },
    {
      handler: (req) => {
        const status = req.query.get("status");
        const items = status
          ? policies().filter((p) => jsonField(p, "status") === status)
          : policies();
        return json(page(items, pageOptions(req)));
      },
      method: "GET",
      path: "/policies",
      service: "governance",
    },
    {
      handler: (req) => {
        const policy = policyRecord(bodyObject(req));
        state.write("policies", String(jsonField(policy, "id")), policy);
        return json(policy, 201);
      },
      method: "POST",
      path: "/policies",
      service: "governance",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const { definition } = body;
        const format = String(
          jsonField(body, "definition_format") ?? "json_schema"
        );
        const errors: string[] = [];
        if (
          definition === undefined ||
          definition === null ||
          definition === ""
        ) {
          errors.push("definition is required");
        } else if (format === "json_schema" && typeof definition !== "object") {
          errors.push("json_schema definitions must be objects");
        } else if (
          (format === "rego" || format === "cel") &&
          typeof definition !== "string"
        ) {
          errors.push(`${format} definitions must be strings`);
        }
        return json({
          errors: errors.length > 0 ? errors : undefined,
          valid: errors.length === 0,
        });
      },
      method: "POST",
      path: "/policies/validate",
      service: "governance",
    },
    {
      handler: (req) => {
        const policy = state.read("policies", pathParam(req, "id"));
        return policy
          ? json(policy)
          : notFound(req, `Policy ${pathParam(req, "id")}`);
      },
      method: "GET",
      path: "/policies/{id}",
      service: "governance",
    },
    {
      handler: (req) =>
        state.remove("policies", pathParam(req, "id"))
          ? new Response(null, { status: 204 })
          : notFound(req, `Policy ${pathParam(req, "id")}`),
      method: "DELETE",
      path: "/policies/{id}",
      service: "governance",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const action = String(jsonField(body, "action") ?? "");
        const resourceType = jsonField(body, "resource_type")
          ? String(jsonField(body, "resource_type"))
          : undefined;
        const roles = (jsonArray(body, "role_names") ?? []).map(String);
        const denied = denyRules().find((rule) => {
          const ruleAction = jsonField(rule, "action");
          const ruleResource = jsonField(rule, "resource_type");
          const ruleRoles = jsonArray(rule, "roles");
          return (
            (ruleAction === "*" || ruleAction === action) &&
            (!ruleResource || ruleResource === resourceType) &&
            (ruleRoles === undefined ||
              ruleRoles.some((r) => roles.includes(String(r))))
          );
        });
        return json({
          allowed: !denied,
          policy_id:
            denied === undefined ? undefined : jsonField(denied, "policy_id"),
          reason: denied
            ? String(
                jsonField(denied, "reason") ??
                  `denied by policy ${jsonField(denied, "policy_name")}`
              )
            : undefined,
        });
      },
      method: "POST",
      path: "/access/check",
      service: "governance",
    },
    {
      handler: (req) =>
        json(
          page(
            [{ id: "role_dev", name: "developer", permissions: ["*"] }],
            pageOptions(req)
          )
        ),
      method: "GET",
      path: "/roles",
      service: "governance",
    },
    {
      handler: (req) =>
        json(page([{ id: "perm_all", name: "*" }], pageOptions(req))),
      method: "GET",
      path: "/permissions",
      service: "governance",
    },
    {
      handler: (req) =>
        json(page([{ id: "fw_local", name: "local-dev" }], pageOptions(req))),
      method: "GET",
      path: "/compliance/frameworks",
      service: "governance",
    },
    {
      handler: () => {
        const total = policies().length;
        return json({
          computed_at: nowIso(),
          policies: total,
          score: total === 0 ? 100 : Math.max(0, 100 - denyRules().length * 10),
          violations: 0,
        });
      },
      method: "GET",
      path: "/compliance/score",
      service: "governance",
    },
    {
      handler: (req) => json(page([], pageOptions(req))),
      method: "GET",
      path: "/compliance/violations",
      service: "governance",
    },
  ];
}

function workerRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;

  return [
    {
      handler: (req) => json(page(state.list("workers"), pageOptions(req))),
      method: "GET",
      path: "/workers",
      service: "workers",
    },
    {
      handler: (req) => {
        const body = bodyObject(req);
        const name = String(jsonField(body, "name") ?? "");
        if (!SAFE_NAME.test(name)) {
          return apiError(
            400,
            "VALIDATION_ERROR",
            "name must be lowercase letters, digits and dashes",
            req,
            { fields: [{ field: "name", message: "Invalid worker name" }] }
          );
        }
        const code = jsonString(body, "code");
        if (code === undefined || code.length === 0) {
          return apiError(400, "VALIDATION_ERROR", "code is required", req, {
            fields: [{ field: "code", message: "Required" }],
          });
        }
        const previous = state.read("workers", name);
        const version =
          Number((previous ? jsonField(previous, "version") : undefined) ?? 0) +
          1;
        const { origin } = new URL(req.raw.url);
        const worker = {
          code_size: code.length,
          deployed_at: nowIso(),
          entrypoint: jsonField(body, "entrypoint") ?? "index.js",
          env_vars: jsonObject(body, "env_vars") ?? {},
          environment: ctx.env,
          name,
          url: `${origin}/v1/workers/${name}`,
          version,
        };
        state.write("workers", name, {
          ...worker,
          code: jsonField(body, "code"),
        });
        return json(worker, 201);
      },
      method: "POST",
      path: "/workers",
      service: "workers",
    },
    {
      handler: (req) => {
        const worker = state.read("workers", pathParam(req, "name"));
        if (!worker) {
          return notFound(req, `Worker ${pathParam(req, "name")}`);
        }
        const { code: _code, env_vars: _env, ...visible } = worker;
        return json({ ...visible, invoked: true });
      },
      method: "GET",
      path: "/workers/{name}",
      service: "workers",
    },
    {
      handler: (req) => {
        const worker = state.read("workers", pathParam(req, "name"));
        if (!worker) {
          return notFound(req, `Worker ${pathParam(req, "name")}`);
        }
        return json({
          input: req.body ?? null,
          invoked: true,
          name: jsonField(worker, "name"),
          version: jsonField(worker, "version"),
        });
      },
      method: "POST",
      path: "/workers/{name}",
      service: "workers",
    },
    {
      handler: (req) =>
        state.remove("workers", pathParam(req, "name"))
          ? new Response(null, { status: 204 })
          : notFound(req, `Worker ${pathParam(req, "name")}`),
      method: "DELETE",
      path: "/workers/{name}",
      service: "workers",
    },
  ];
}

function authRoutes(ctx: LocalContext): RouteDefinition[] {
  const profile = (): Obj => ({
    created_at: new Date(ctx.startedAt).toISOString(),
    email: "dev@localhost",
    environment: ctx.env,
    id: "usr_local_dev",
    name: "Local developer",
    role_names: ["developer"],
    roles: ["developer"],
  });
  return [
    {
      handler: () => json(profile()),
      method: "GET",
      path: "/auth/account/profile",
      service: "auth",
    },
    {
      handler: () => json({ enabled: false, methods: [] }),
      method: "GET",
      path: "/auth/mfa/status",
      service: "auth",
    },
  ];
}

/** Every built-in local route. Order matters: specific paths before `{id}`. */
export function createLocalRoutes(ctx: LocalContext): RouteDefinition[] {
  return [
    ...healthRoutes(ctx),
    ...authRoutes(ctx),
    ...workerRoutes(ctx),
    ...agentRoutes(ctx),
    ...graphRoutes(ctx),
    ...datasetRoutes(ctx),
    ...blobRoutes(ctx),
    ...observabilityRoutes(ctx),
    ...governanceRoutes(ctx),
  ];
}
