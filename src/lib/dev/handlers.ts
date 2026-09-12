import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
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

export function json(body: unknown, status = 200, headers: Obj = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers as Record<string, string>),
    },
  });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extra: Obj = {}
): Response {
  return json(
    {
      code,
      message,
      requestId,
      docs: `${DOCS_URL}#${code.toLowerCase()}`,
      ...extra,
    },
    status
  );
}

function notFound(req: DevRequest, what: string): Response {
  return apiError(404, "NOT_FOUND", `${what} not found`, req.requestId);
}

function bodyObject(req: DevRequest): Obj {
  return typeof req.body === "object" &&
    req.body !== null &&
    !Array.isArray(req.body)
    ? (req.body as Obj)
    : {};
}

function pageOptions(req: DevRequest): { cursor?: string; limit?: number } {
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
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
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
        yield await Promise.resolve(item);
      }
    },
  };
}

function healthRoutes(ctx: LocalContext): RouteDefinition[] {
  const health = (): Response =>
    json({
      ok: true,
      status: "ok",
      version: VERSION,
      env: ctx.env,
      uptime_ms: Date.now() - ctx.startedAt,
      services: ctx.services,
    });
  return [
    { method: "GET", path: "/health", service: "dev", handler: health },
    {
      method: "GET",
      path: "/agents/health",
      service: "agents",
      handler: health,
    },
    {
      method: "GET",
      path: "/ontology/graph/health",
      service: "graph",
      handler: health,
    },
  ];
}

function agentRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const load = (id: string): Obj | undefined => state.read<Obj>("agents", id);
  const save = (agent: Obj): void =>
    state.write("agents", String(agent.id), agent);
  const versionsOf = (agent: Obj): Obj[] => {
    const count = Number(agent.version ?? 1);
    return Array.from({ length: count }, (_, i) =>
      agentVersionRecord(agent, i + 1)
    ).reverse();
  };

  return [
    {
      method: "GET",
      path: "/agents",
      service: "agents",
      handler: (req) => {
        let agents = state.list<Obj>("agents");
        const status = req.query.get("status");
        if (status) {
          agents = agents.filter((a) => a.status === status);
        }
        return json(page(agents, pageOptions(req)));
      },
    },
    {
      method: "POST",
      path: "/agents",
      service: "agents",
      handler: (req) => {
        const definition = bodyObject(req);
        if (
          typeof definition.name !== "string" ||
          definition.name.length === 0
        ) {
          return apiError(
            400,
            "VALIDATION_ERROR",
            "name is required",
            req.requestId,
            {
              fields: [{ field: "name", message: "Required" }],
            }
          );
        }
        const agent = agentRecord(definition, { environment: ctx.env });
        save(agent);
        return json(agent, 201);
      },
    },
    {
      method: "GET",
      path: "/agents/runs/{runId}/conversation",
      service: "agents",
      handler: (req) => {
        const run = state.read<Obj>("runs", req.params.runId as string);
        return run
          ? json({ messages: [{ role: "system", content: "local dev run" }] })
          : notFound(req, `Run ${req.params.runId}`);
      },
    },
    {
      method: "GET",
      path: "/agents/runs/{runId}/stream",
      service: "agents",
      handler: (req) => {
        const run = state.read<Obj>("runs", req.params.runId as string);
        if (!run) {
          return notFound(req, `Run ${req.params.runId}`);
        }
        return sseResponse(
          once([
            { event: "status", data: { run_id: run.id, status: "running" } },
            { event: "step", data: { step: 1, type: "observe" } },
            { event: "status", data: { run_id: run.id, status: run.status } },
            { event: "done", data: run },
          ]),
          req.requestId
        );
      },
    },
    {
      method: "GET",
      path: "/agents/runs/{runId}",
      service: "agents",
      handler: (req) => {
        const run = state.read<Obj>("runs", req.params.runId as string);
        return run ? json(run) : notFound(req, `Run ${req.params.runId}`);
      },
    },
    {
      method: "GET",
      path: "/agents/{id}/versions",
      service: "agents",
      handler: (req) => {
        const agent = load(req.params.id as string);
        return agent
          ? json(page(versionsOf(agent), pageOptions(req)))
          : notFound(req, `Agent ${req.params.id}`);
      },
    },
    {
      method: "POST",
      path: "/agents/{id}/rollback",
      service: "agents",
      handler: (req) => {
        const agent = load(req.params.id as string);
        if (!agent) {
          return notFound(req, `Agent ${req.params.id}`);
        }
        const body = bodyObject(req);
        const current = Number(agent.version ?? 1);
        const target =
          typeof body.to_version === "number" ? body.to_version : current - 1;
        if (target < 1 || target > current) {
          return apiError(
            400,
            "VALIDATION_ERROR",
            `Cannot roll back agent ${agent.id} to version ${target}`,
            req.requestId,
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
          version: current + 1,
          rolled_back_from: current,
          rolled_back_to: target,
          updated_at: nowIso(),
        };
        save(rolledBack);
        return json(rolledBack);
      },
    },
    {
      method: "GET",
      path: "/agents/{id}/runs",
      service: "agents",
      handler: (req) => {
        const agent = load(req.params.id as string);
        if (!agent) {
          return notFound(req, `Agent ${req.params.id}`);
        }
        const runs = state
          .list<Obj>("runs")
          .filter((r) => r.agent_id === agent.id);
        return json(page(runs, pageOptions(req)));
      },
    },
    {
      method: "POST",
      path: "/agents/{id}/runs",
      service: "agents",
      handler: (req) => {
        const agent = load(req.params.id as string);
        if (!agent) {
          return notFound(req, `Agent ${req.params.id}`);
        }
        const body = bodyObject(req);
        const run = executionRecord(
          String(agent.id),
          String(body.event ?? "manual"),
          (body.payload as Obj) ?? {}
        );
        state.write("runs", String(run.id), run);
        emitLog(
          ctx,
          logEntry("info", `agent ${agent.name} handled ${run.trigger_event}`, {
            agent_id: agent.id,
            run_id: run.id,
          })
        );
        return json(run, 202);
      },
    },
    {
      method: "GET",
      path: "/agents/{id}",
      service: "agents",
      handler: (req) => {
        const agent = load(req.params.id as string);
        return agent ? json(agent) : notFound(req, `Agent ${req.params.id}`);
      },
    },
    {
      method: "PUT",
      path: "/agents/{id}",
      service: "agents",
      handler: (req) => {
        const agent = load(req.params.id as string);
        if (!agent) {
          return notFound(req, `Agent ${req.params.id}`);
        }
        const updated = {
          ...agent,
          ...bodyObject(req),
          id: agent.id,
          version: Number(agent.version ?? 1) + 1,
          updated_at: nowIso(),
        };
        save(updated);
        return json(updated);
      },
    },
    {
      method: "DELETE",
      path: "/agents/{id}",
      service: "agents",
      handler: (req) =>
        state.remove("agents", req.params.id as string)
          ? new Response(null, { status: 204 })
          : notFound(req, `Agent ${req.params.id}`),
    },
  ];
}

function graphRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const entities = (): Obj[] =>
    state.list<Obj>("graph").filter((r) => String(r.id).startsWith("ent_"));
  const load = (id: string): Obj | undefined => state.read<Obj>("graph", id);

  const matches = (entity: Obj, conditions: Obj): boolean => {
    const fields = (entity.fields as Obj) ?? {};
    return Object.entries(conditions).every(([key, expected]) => {
      const actual = key === "type" ? entity.type : fields[key];
      if (key === "type" && entity.type === null) {
        return true;
      }
      return matchesFilter(actual, expected);
    });
  };

  const queryHandler = (req: DevRequest): Response => {
    const body = bodyObject(req);
    const conditions = (body.conditions as Obj) ?? (body.filter as Obj) ?? {};
    const entityType = body.entity_type ?? body.type;
    // Entities created via `use(type).create()` carry no type on the wire;
    // they match any entity_type filter.
    const results = entities().filter(
      (e) =>
        (entityType && e.type !== null ? e.type === entityType : true) &&
        matches(e, conditions)
    );
    return json(
      page(results, {
        cursor: typeof body.cursor === "string" ? body.cursor : undefined,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      })
    );
  };

  return [
    {
      method: "GET",
      path: "/ontology/graph/info",
      service: "graph",
      handler: () => json({ name: "frontal-dev", entities: entities().length }),
    },
    {
      method: "GET",
      path: "/ontology/graph/capabilities",
      service: "graph",
      handler: () =>
        json({ query: true, neighborhood: true, path: true, semantic: false }),
    },
    {
      method: "GET",
      path: "/ontology/graph/entities",
      service: "graph",
      handler: (req) => {
        const conditions = req.query.get("conditions");
        let items = entities();
        if (conditions) {
          try {
            const parsed = JSON.parse(conditions) as Obj;
            items = items.filter((e) => matches(e, parsed));
          } catch {
            return apiError(
              400,
              "VALIDATION_ERROR",
              "conditions must be JSON",
              req.requestId
            );
          }
        }
        return json(page(items, pageOptions(req)));
      },
    },
    {
      method: "POST",
      path: "/ontology/graph/entities",
      service: "graph",
      handler: (req) => {
        const body = bodyObject(req);
        const fields = (body.fields as Obj) ?? body;
        const entity = entityRecord(fields);
        state.write("graph", String(entity.id), entity);
        return json(entity, 201);
      },
    },
    {
      method: "GET",
      path: "/ontology/graph/entities/{id}/provenance",
      service: "graph",
      handler: (req) => {
        const entity = load(req.params.id as string);
        if (!entity) {
          return notFound(req, `Entity ${req.params.id}`);
        }
        const links = state
          .list<Obj>("graph")
          .filter(
            (r) => String(r.id).startsWith("rel_") && r.from_id === entity.id
          );
        return json({
          entity_id: entity.id,
          data: links,
          history: [
            { version: 1, changed_at: entity.created_at, change: "created" },
          ],
        });
      },
    },
    {
      method: "POST",
      path: "/ontology/graph/entities/{id}/provenance",
      service: "graph",
      handler: (req) => {
        const entity = load(req.params.id as string);
        if (!entity) {
          return notFound(req, `Entity ${req.params.id}`);
        }
        const body = bodyObject(req);
        const relationship = {
          id: newId("rel"),
          from_id: entity.id,
          to_id: body.target_id ?? body.to_id ?? body.entity_id,
          type: body.type ?? body.relationship ?? "related",
          fields: (body.fields as Obj) ?? {},
          created_at: nowIso(),
        };
        state.write("graph", String(relationship.id), relationship);
        return json(relationship, 201);
      },
    },
    {
      method: "GET",
      path: "/ontology/graph/entities/{id}",
      service: "graph",
      handler: (req) => {
        const entity = load(req.params.id as string);
        return entity ? json(entity) : notFound(req, `Entity ${req.params.id}`);
      },
    },
    {
      method: "PUT",
      path: "/ontology/graph/entities/{id}",
      service: "graph",
      handler: (req) => {
        const entity = load(req.params.id as string);
        if (!entity) {
          return notFound(req, `Entity ${req.params.id}`);
        }
        const body = bodyObject(req);
        const updated = {
          ...entity,
          fields: {
            ...(entity.fields as Obj),
            ...((body.fields as Obj) ?? {}),
          },
          version: Number(entity.version ?? 1) + 1,
          updated_at: nowIso(),
        };
        state.write("graph", String(entity.id), updated);
        return json(updated);
      },
    },
    {
      method: "DELETE",
      path: "/ontology/graph/entities/{id}",
      service: "graph",
      handler: (req) =>
        state.remove("graph", req.params.id as string)
          ? new Response(null, { status: 204 })
          : notFound(req, `Entity ${req.params.id}`),
    },
    {
      method: "GET",
      path: "/ontology/graph/relationships/{id}",
      service: "graph",
      handler: (req) => {
        const rel = load(req.params.id as string);
        return rel ? json(rel) : notFound(req, `Relationship ${req.params.id}`);
      },
    },
    {
      method: "DELETE",
      path: "/ontology/graph/relationships/{id}",
      service: "graph",
      handler: (req) =>
        state.remove("graph", req.params.id as string)
          ? new Response(null, { status: 204 })
          : notFound(req, `Relationship ${req.params.id}`),
    },
    {
      method: "POST",
      path: "/ontology/graph/graph/query",
      service: "graph",
      handler: queryHandler,
    },
    {
      method: "POST",
      path: "/ontology/graph/graph/bulk-read",
      service: "graph",
      handler: (req) => {
        const ids = (bodyObject(req).ids as string[]) ?? [];
        return json({ data: ids.map((id) => load(id)).filter(Boolean) });
      },
    },
    {
      method: "POST",
      path: "/ontology/graph/graph/neighborhood",
      service: "graph",
      handler: (req) => {
        const body = bodyObject(req);
        const startId = String(
          body.start_id ?? body.entity_id ?? body.id ?? ""
        );
        const start = load(startId);
        if (!start) {
          return notFound(req, `Entity ${startId || "(missing start_id)"}`);
        }
        const rels = state
          .list<Obj>("graph")
          .filter(
            (r) => String(r.id).startsWith("rel_") && r.from_id === start.id
          );
        const nodes = [
          start,
          ...rels.map((r) => load(String(r.to_id))).filter(Boolean),
        ];
        return json({ nodes, edges: rels, data: nodes, results: nodes });
      },
    },
    {
      method: "POST",
      path: "/ontology/graph/graph/path",
      service: "graph",
      handler: (req) => {
        const body = bodyObject(req);
        const from = load(String(body.from_id ?? body.start_id ?? ""));
        const to = load(String(body.to_id ?? body.end_id ?? ""));
        if (!(from && to)) {
          return notFound(req, "Path endpoints");
        }
        const direct = state
          .list<Obj>("graph")
          .find(
            (r) =>
              String(r.id).startsWith("rel_") &&
              r.from_id === from.id &&
              r.to_id === to.id
          );
        return json({
          found: Boolean(direct),
          path: direct ? [from, to] : [],
          edges: direct ? [direct] : [],
          length: direct ? 1 : 0,
        });
      },
    },
    {
      method: "POST",
      path: "/ontology/graph/graph/analyze",
      service: "graph",
      handler: (req) => {
        const body = bodyObject(req);
        return json({
          question: body.question ?? body.query,
          answer: `Local dev graph has ${entities().length} entities.`,
          data: entities().slice(0, 10),
        });
      },
    },
  ];
}

function datasetRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const datasets = (): Obj[] => state.list<Obj>("datasets");
  const catalog = (ds: Obj): Obj => ({ ...ds, source: "local" });

  return [
    {
      method: "GET",
      path: "/data/ingest/datasets",
      service: "datasets",
      handler: (req) => json(page(datasets(), pageOptions(req))),
    },
    {
      method: "POST",
      path: "/data/ingest/datasets/ingest",
      service: "datasets",
      handler: (req) => {
        const body = bodyObject(req);
        const existing =
          typeof body.dataset_id === "string"
            ? state.read<Obj>("datasets", body.dataset_id)
            : undefined;
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const dataset = existing
          ? {
              ...existing,
              row_count: Number(existing.row_count ?? 0) + rows.length,
              updated_at: nowIso(),
            }
          : datasetRecord(body);
        state.write("datasets", String(dataset.id), dataset);
        return json(
          { dataset_id: dataset.id, ingested: rows.length, dataset },
          202
        );
      },
    },
    {
      method: "GET",
      path: "/data/ingest/datasets/{id}",
      service: "datasets",
      handler: (req) => {
        const ds = state.read<Obj>("datasets", req.params.id as string);
        return ds ? json(ds) : notFound(req, `Dataset ${req.params.id}`);
      },
    },
    {
      method: "GET",
      path: "/data/ingest/schemas",
      service: "datasets",
      handler: (req) => json(page([], pageOptions(req))),
    },
    {
      method: "GET",
      path: "/data/catalog/catalog/datasets",
      service: "datasets",
      handler: (req) => json(page(datasets().map(catalog), pageOptions(req))),
    },
    {
      method: "GET",
      path: "/data/catalog/catalog/datasets/{id}",
      service: "datasets",
      handler: (req) => {
        const ds = state.read<Obj>("datasets", req.params.id as string);
        return ds
          ? json(catalog(ds))
          : notFound(req, `Dataset ${req.params.id}`);
      },
    },
    {
      method: "GET",
      path: "/data/catalog/catalog/sources",
      service: "datasets",
      handler: (req) =>
        json(
          page(
            [{ id: "src_local", name: "local", type: "dev" }],
            pageOptions(req)
          )
        ),
    },
  ];
}

interface BlobMeta {
  bucket: string;
  content_type: string;
  created_at: string;
  file: string;
  key: string;
  size: number;
}

function blobRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;
  const blobDir = join(state.baseDir, "blob", "objects");
  const metaId = (bucket: string, key: string): string =>
    createHash("sha1").update(`${bucket}/${key}`).digest("hex");
  const meta = (bucket: string, key: string): BlobMeta | undefined =>
    state.read<BlobMeta>("blob", metaId(bucket, key));

  const objectPath = (req: DevRequest): { bucket: string; key: string } => ({
    bucket: req.params.bucket as string,
    key: req.params["*"] as string,
  });

  return [
    {
      method: "POST",
      path: "/blob/object/list/{bucket}",
      service: "blob",
      handler: (req) => {
        const body = bodyObject(req);
        const prefix = typeof body.prefix === "string" ? body.prefix : "";
        const objects = state
          .list<BlobMeta>("blob")
          .filter(
            (m) => m.bucket === req.params.bucket && m.key.startsWith(prefix)
          )
          .map((m) => ({
            key: m.key,
            name: m.key,
            size: m.size,
            content_type: m.content_type,
            created_at: m.created_at,
            last_modified: m.created_at,
          }));
        return json({
          objects,
          data: objects,
          has_more: false,
          total: objects.length,
        });
      },
    },
    {
      method: "POST",
      path: "/blob/object/sign/{bucket}/*",
      service: "blob",
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const origin = new URL(req.raw.url).origin;
        return json({
          signed_url: `${origin}/v1/blob/object/${bucket}/${key}?token=dev`,
        });
      },
    },
    {
      method: "GET",
      path: "/blob/object/info/{bucket}/*",
      service: "blob",
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const found = meta(bucket, key);
        return found
          ? json({
              key,
              size: found.size,
              content_type: found.content_type,
              created_at: found.created_at,
            })
          : notFound(req, `Object ${bucket}/${key}`);
      },
    },
    {
      method: "POST",
      path: "/blob/object/copy",
      service: "blob",
      handler: (req) => copyOrMove(req, false),
    },
    {
      method: "POST",
      path: "/blob/object/move",
      service: "blob",
      handler: (req) => copyOrMove(req, true),
    },
    {
      method: "POST",
      path: "/blob/object/{bucket}/*",
      service: "blob",
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
              req.requestId
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
          key,
          content_type: contentType,
          size: bytes.byteLength,
          created_at: nowIso(),
          file,
        } satisfies BlobMeta);
        return json(
          { key, size: bytes.byteLength, content_type: contentType },
          201
        );
      },
    },
    {
      method: "GET",
      path: "/blob/object/{bucket}/*",
      service: "blob",
      handler: (req) => {
        const { bucket, key } = objectPath(req);
        const found = meta(bucket, key);
        if (!(found && existsSync(found.file))) {
          return notFound(req, `Object ${bucket}/${key}`);
        }
        return new Response(readFileSync(found.file), {
          headers: {
            "content-type": found.content_type,
            "content-length": String(found.size),
          },
        });
      },
    },
    {
      method: "DELETE",
      path: "/blob/object/{bucket}/*",
      service: "blob",
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
    },
  ];

  function copyOrMove(req: DevRequest, move: boolean): Response {
    const body = bodyObject(req);
    const from = body.source ?? body.from ?? {};
    const to = body.destination ?? body.to ?? {};
    const src = from as Obj;
    const dst = to as Obj;
    const srcMeta = meta(
      String(src.bucket ?? body.from_bucket),
      String(src.key ?? body.from_key)
    );
    if (!(srcMeta && existsSync(srcMeta.file))) {
      return notFound(req, "Source object");
    }
    const dstBucket = String(dst.bucket ?? body.to_bucket ?? srcMeta.bucket);
    const dstKey = String(dst.key ?? body.to_key ?? srcMeta.key);
    const id = metaId(dstBucket, dstKey);
    const file = join(blobDir, `${id}.bin`);
    mkdirSync(blobDir, { recursive: true });
    writeFileSync(file, readFileSync(srcMeta.file));
    state.write("blob", id, {
      ...srcMeta,
      bucket: dstBucket,
      key: dstKey,
      file,
      created_at: nowIso(),
    });
    if (move) {
      rmSync(srcMeta.file, { force: true });
      state.remove("blob", metaId(srcMeta.bucket, srcMeta.key));
    }
    return json({ key: dstKey, bucket: dstBucket, moved: move });
  }
}

function observabilityRoutes(ctx: LocalContext): RouteDefinition[] {
  const filterLogs = (input: Obj): Obj[] => {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const level = typeof input.level === "string" ? input.level : undefined;
    const tokens = query === "" || query === "*" ? [] : query.split(WHITESPACE);
    return ctx.logs.filter((entry) => {
      if (level && entry.level !== level) {
        return false;
      }
      return tokens.every((token) => matchesLogToken(entry, token));
    });
  };

  return [
    {
      method: "POST",
      path: "/observability/logs/query",
      service: "observability",
      handler: (req) => {
        const body = bodyObject(req);
        const entries = filterLogs(body);
        const ordered = body.order === "asc" ? entries : [...entries].reverse();
        return json(
          page(ordered, {
            cursor: typeof body.cursor === "string" ? body.cursor : undefined,
            limit: typeof body.limit === "number" ? body.limit : undefined,
          })
        );
      },
    },
    {
      method: "GET",
      path: "/observability/logs/stream",
      service: "observability",
      handler: (req) => {
        const query = req.query.get("query") ?? "";
        const level = req.query.get("level") ?? undefined;
        const signal = req.raw.signal;
        const events: AsyncIterable<{
          data: unknown;
          event?: string;
          id?: string;
        }> = {
          [Symbol.asyncIterator]() {
            const queue: Obj[] = [];
            let wake: (() => void) | undefined;
            const subscriber = (entry: Obj): void => {
              if (filterLogs({ query, level }).includes(entry)) {
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
                  value: { event: "log", id: String(entry.id), data: entry },
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
    },
    {
      method: "POST",
      path: "/observability/logs/ingest",
      service: "observability",
      handler: (req) => {
        const entries = (bodyObject(req).entries as Obj[]) ?? [];
        for (const entry of entries) {
          emitLog(ctx, {
            id: newId("log"),
            timestamp: nowIso(),
            service: "app",
            ...entry,
          });
        }
        return json({ ingested: entries.length }, 202);
      },
    },
    {
      method: "GET",
      path: "/observability/metrics",
      service: "observability",
      handler: () =>
        json({
          data: [
            {
              name: "frontal_dev_requests_total",
              value: ctx.logs.length,
              unit: "count",
            },
            {
              name: "frontal_dev_uptime_ms",
              value: Date.now() - ctx.startedAt,
              unit: "ms",
            },
          ],
        }),
    },
    {
      method: "GET",
      path: "/observability/events/stats",
      service: "observability",
      handler: () =>
        json({ total: ctx.logs.length, by_level: countBy(ctx.logs, "level") }),
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
  if (
    expected === null ||
    typeof expected !== "object" ||
    Array.isArray(expected)
  ) {
    return actual === expected;
  }
  const ops = expected as Obj;
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
    const metadata = (entry.metadata as Obj | undefined) ?? {};
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
  const policies = (): Obj[] => state.list<Obj>("policies");
  const denyRules = (): Obj[] =>
    policies().flatMap((p) => {
      const def = (p.definition as Obj) ?? {};
      const deny = Array.isArray(def.deny) ? (def.deny as Obj[]) : [];
      return deny.map((rule) => ({
        ...rule,
        policy_id: p.id,
        policy_name: p.name,
      }));
    });

  return [
    {
      method: "GET",
      path: "/policies/templates",
      service: "governance",
      handler: (req) =>
        json(
          page(
            [
              {
                id: "tpl_deny_prod_without_review",
                name: "Require review before production deploys",
                definition_format: "json_schema",
              },
            ],
            pageOptions(req)
          )
        ),
    },
    {
      method: "GET",
      path: "/policies",
      service: "governance",
      handler: (req) => {
        const status = req.query.get("status");
        const items = status
          ? policies().filter((p) => p.status === status)
          : policies();
        return json(page(items, pageOptions(req)));
      },
    },
    {
      method: "POST",
      path: "/policies",
      service: "governance",
      handler: (req) => {
        const policy = policyRecord(bodyObject(req));
        state.write("policies", String(policy.id), policy);
        return json(policy, 201);
      },
    },
    {
      method: "POST",
      path: "/policies/validate",
      service: "governance",
      handler: (req) => {
        const body = bodyObject(req);
        const definition = body.definition;
        const format = String(body.definition_format ?? "json_schema");
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
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
        });
      },
    },
    {
      method: "GET",
      path: "/policies/{id}",
      service: "governance",
      handler: (req) => {
        const policy = state.read<Obj>("policies", req.params.id as string);
        return policy ? json(policy) : notFound(req, `Policy ${req.params.id}`);
      },
    },
    {
      method: "DELETE",
      path: "/policies/{id}",
      service: "governance",
      handler: (req) =>
        state.remove("policies", req.params.id as string)
          ? new Response(null, { status: 204 })
          : notFound(req, `Policy ${req.params.id}`),
    },
    {
      method: "POST",
      path: "/access/check",
      service: "governance",
      handler: (req) => {
        const body = bodyObject(req);
        const action = String(body.action ?? "");
        const resourceType = body.resource_type
          ? String(body.resource_type)
          : undefined;
        const roles = Array.isArray(body.role_names)
          ? body.role_names.map(String)
          : [];
        const denied = denyRules().find(
          (rule) =>
            (rule.action === "*" || rule.action === action) &&
            (!rule.resource_type || rule.resource_type === resourceType) &&
            (!Array.isArray(rule.roles) ||
              rule.roles.some((r) => roles.includes(String(r))))
        );
        return json({
          allowed: !denied,
          reason: denied
            ? String(denied.reason ?? `denied by policy ${denied.policy_name}`)
            : undefined,
          policy_id: denied?.policy_id,
        });
      },
    },
    {
      method: "GET",
      path: "/roles",
      service: "governance",
      handler: (req) =>
        json(
          page(
            [{ id: "role_dev", name: "developer", permissions: ["*"] }],
            pageOptions(req)
          )
        ),
    },
    {
      method: "GET",
      path: "/permissions",
      service: "governance",
      handler: (req) =>
        json(page([{ id: "perm_all", name: "*" }], pageOptions(req))),
    },
    {
      method: "GET",
      path: "/compliance/frameworks",
      service: "governance",
      handler: (req) =>
        json(page([{ id: "fw_local", name: "local-dev" }], pageOptions(req))),
    },
    {
      method: "GET",
      path: "/compliance/score",
      service: "governance",
      handler: () => {
        const total = policies().length;
        return json({
          score: total === 0 ? 100 : Math.max(0, 100 - denyRules().length * 10),
          policies: total,
          violations: 0,
          computed_at: nowIso(),
        });
      },
    },
    {
      method: "GET",
      path: "/compliance/violations",
      service: "governance",
      handler: (req) => json(page([], pageOptions(req))),
    },
  ];
}

function workerRoutes(ctx: LocalContext): RouteDefinition[] {
  const { state } = ctx;

  return [
    {
      method: "GET",
      path: "/workers",
      service: "workers",
      handler: (req) =>
        json(page(state.list<Obj>("workers"), pageOptions(req))),
    },
    {
      method: "POST",
      path: "/workers",
      service: "workers",
      handler: (req) => {
        const body = bodyObject(req);
        const name = String(body.name ?? "");
        if (!SAFE_NAME.test(name)) {
          return apiError(
            400,
            "VALIDATION_ERROR",
            "name must be lowercase letters, digits and dashes",
            req.requestId,
            { fields: [{ field: "name", message: "Invalid worker name" }] }
          );
        }
        if (typeof body.code !== "string" || body.code.length === 0) {
          return apiError(
            400,
            "VALIDATION_ERROR",
            "code is required",
            req.requestId,
            {
              fields: [{ field: "code", message: "Required" }],
            }
          );
        }
        const previous = state.read<Obj>("workers", name);
        const version = Number(previous?.version ?? 0) + 1;
        const origin = new URL(req.raw.url).origin;
        const worker = {
          name,
          version,
          entrypoint: body.entrypoint ?? "index.js",
          env_vars: (body.env_vars as Obj) ?? {},
          code_size: body.code.length,
          url: `${origin}/v1/workers/${name}`,
          deployed_at: nowIso(),
          environment: ctx.env,
        };
        state.write("workers", name, { ...worker, code: body.code });
        return json(worker, 201);
      },
    },
    {
      method: "GET",
      path: "/workers/{name}",
      service: "workers",
      handler: (req) => {
        const worker = state.read<Obj>("workers", req.params.name as string);
        if (!worker) {
          return notFound(req, `Worker ${req.params.name}`);
        }
        const { code: _code, env_vars: _env, ...visible } = worker;
        return json({ ...visible, invoked: true });
      },
    },
    {
      method: "POST",
      path: "/workers/{name}",
      service: "workers",
      handler: (req) => {
        const worker = state.read<Obj>("workers", req.params.name as string);
        if (!worker) {
          return notFound(req, `Worker ${req.params.name}`);
        }
        return json({
          name: worker.name,
          version: worker.version,
          invoked: true,
          input: req.body ?? null,
        });
      },
    },
    {
      method: "DELETE",
      path: "/workers/{name}",
      service: "workers",
      handler: (req) =>
        state.remove("workers", req.params.name as string)
          ? new Response(null, { status: 204 })
          : notFound(req, `Worker ${req.params.name}`),
    },
  ];
}

function authRoutes(ctx: LocalContext): RouteDefinition[] {
  const profile = (): Obj => ({
    id: "usr_local_dev",
    email: "dev@localhost",
    name: "Local developer",
    roles: ["developer"],
    role_names: ["developer"],
    environment: ctx.env,
    created_at: new Date(ctx.startedAt).toISOString(),
  });
  return [
    {
      method: "GET",
      path: "/auth/account/profile",
      service: "auth",
      handler: () => json(profile()),
    },
    {
      method: "GET",
      path: "/auth/mfa/status",
      service: "auth",
      handler: () => json({ enabled: false, methods: [] }),
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
