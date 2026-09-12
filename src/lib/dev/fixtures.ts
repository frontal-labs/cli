import { randomBytes } from "node:crypto";

/**
 * Record factories for the local dev server. Shapes follow the SDK's Zod
 * schemas (`@frontal-labs/agents`, `@frontal-labs/graph`, ...) and the
 * `fixtures` helpers in `@frontal-labs/testing`, using wire-format
 * (snake_case) keys because the SDK camelCases responses on the way in.
 */

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

type Obj = Record<string, unknown>;

const DEFAULT_SCOPE = {
  read: [],
  write: [],
  actions: [],
  escalate: [],
  invoke_agents: [],
  invoke_functions: [],
};

const DEFAULT_CONFIDENCE = {
  auto_execute_above: 0.85,
  escalate_below: 0.6,
  require_review_between: true,
};

const DEFAULT_RETRY = {
  max_retries: 3,
  retry_delay: 1000,
  backoff: "exponential",
  retry_on: [408, 409, 425, 429, 500, 502, 503, 504],
};

export function agentRecord(definition: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    id: newId("agt"),
    name: definition.name ?? "agent",
    description: definition.description,
    triggers: definition.triggers ?? [{ event: "manual" }],
    scope: definition.scope ?? DEFAULT_SCOPE,
    confidence: definition.confidence ?? DEFAULT_CONFIDENCE,
    memory: definition.memory ?? { type: "working" },
    retry: definition.retry ?? DEFAULT_RETRY,
    timeout: definition.timeout ?? "30s",
    rate_limit: definition.rate_limit,
    tags: definition.tags ?? [],
    version: 1,
    status: "active",
    environment: "development",
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

export function agentVersionRecord(agent: Obj, version: number): Obj {
  return {
    id: `${String(agent.id)}_v${version}`,
    agent_id: agent.id,
    version,
    status: version === agent.version ? "active" : "superseded",
    definition: {
      name: agent.name,
      description: agent.description,
      triggers: agent.triggers,
      tags: agent.tags,
    },
    created_at: nowIso(),
  };
}

export function executionRecord(
  agentId: string,
  event: string,
  payload: Obj
): Obj {
  const timestamp = nowIso();
  return {
    id: newId("run"),
    agent_id: agentId,
    trigger_event: event,
    trigger_payload: payload,
    status: "completed",
    outcome: "executed",
    confidence: 0.92,
    decision_trace: [
      {
        step: 1,
        type: "observe",
        description: `Received ${event}`,
        duration_ms: 3,
      },
      {
        step: 2,
        type: "complete",
        description: "Local dev server auto-completed the run",
        duration_ms: 1,
      },
    ],
    started_at: timestamp,
    completed_at: timestamp,
    duration_ms: 4,
    environment: "development",
  };
}

export function entityRecord(fields: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    id: newId("ent"),
    // `use(entityType).create(fields)` does not send the type on the wire;
    // fall back to a field named `type` / `entity_type` when present.
    type: fields.type ?? fields.entity_type ?? null,
    fields,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

export function datasetRecord(input: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    id: newId("ds"),
    name: input.name ?? "dataset",
    description: input.description,
    schema_ref: input.schema_ref,
    row_count: Array.isArray(input.rows) ? input.rows.length : 0,
    status: "ready",
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

export function logEntry(
  level: string,
  message: string,
  metadata: Obj = {}
): Obj {
  return {
    id: newId("log"),
    timestamp: nowIso(),
    level,
    service: "frontal-dev",
    message,
    resource: "local",
    metadata,
  };
}

export function policyRecord(input: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    id: newId("pol"),
    name: input.name ?? "policy",
    description: input.description,
    status: "active",
    definition_format: input.definition_format ?? "json_schema",
    definition: input.definition ?? {},
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

export function page<T>(
  items: T[],
  options: { cursor?: string; limit?: number } = {}
): { data: T[]; pagination: Obj } {
  const limit = options.limit && options.limit > 0 ? options.limit : 50;
  const start = options.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
  const data = items.slice(start, start + limit);
  const next = start + limit;
  return {
    data,
    pagination: {
      cursor: next < items.length ? String(next) : "end",
      has_more: next < items.length,
      total: items.length,
      limit,
    },
  };
}
