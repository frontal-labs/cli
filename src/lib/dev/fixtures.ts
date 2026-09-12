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
  actions: [],
  escalate: [],
  invoke_agents: [],
  invoke_functions: [],
  read: [],
  write: [],
};

const DEFAULT_CONFIDENCE = {
  auto_execute_above: 0.85,
  escalate_below: 0.6,
  require_review_between: true,
};

const DEFAULT_RETRY = {
  backoff: "exponential",
  max_retries: 3,
  retry_delay: 1000,
  retry_on: [408, 409, 425, 429, 500, 502, 503, 504],
};

export function agentRecord(definition: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    confidence: definition.confidence ?? DEFAULT_CONFIDENCE,
    created_at: timestamp,
    description: definition.description,
    environment: "development",
    id: newId("agt"),
    memory: definition.memory ?? { type: "working" },
    name: definition.name ?? "agent",
    rate_limit: definition.rate_limit,
    retry: definition.retry ?? DEFAULT_RETRY,
    scope: definition.scope ?? DEFAULT_SCOPE,
    status: "active",
    tags: definition.tags ?? [],
    timeout: definition.timeout ?? "30s",
    triggers: definition.triggers ?? [{ event: "manual" }],
    updated_at: timestamp,
    version: 1,
    ...overrides,
  };
}

export function agentVersionRecord(agent: Obj, version: number): Obj {
  return {
    agent_id: agent.id,
    created_at: nowIso(),
    definition: {
      description: agent.description,
      name: agent.name,
      tags: agent.tags,
      triggers: agent.triggers,
    },
    id: `${String(agent.id)}_v${version}`,
    status: version === agent.version ? "active" : "superseded",
    version,
  };
}

export function executionRecord(
  agentId: string,
  event: string,
  payload: Obj
): Obj {
  const timestamp = nowIso();
  return {
    agent_id: agentId,
    completed_at: timestamp,
    confidence: 0.92,
    decision_trace: [
      {
        description: `Received ${event}`,
        duration_ms: 3,
        step: 1,
        type: "observe",
      },
      {
        description: "Local dev server auto-completed the run",
        duration_ms: 1,
        step: 2,
        type: "complete",
      },
    ],
    duration_ms: 4,
    environment: "development",
    id: newId("run"),
    outcome: "executed",
    started_at: timestamp,
    status: "completed",
    trigger_event: event,
    trigger_payload: payload,
  };
}

export function entityRecord(fields: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    created_at: timestamp,
    fields,
    id: newId("ent"),
    // `use(entityType).create(fields)` does not send the type on the wire;
    // fall back to a field named `type` / `entity_type` when present.
    type: fields.type ?? fields.entity_type ?? null,
    updated_at: timestamp,
    version: 1,
    ...overrides,
  };
}

export function datasetRecord(input: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    created_at: timestamp,
    description: input.description,
    id: newId("ds"),
    name: input.name ?? "dataset",
    row_count: Array.isArray(input.rows) ? input.rows.length : 0,
    schema_ref: input.schema_ref,
    status: "ready",
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
    level,
    message,
    metadata,
    resource: "local",
    service: "frontal-dev",
    timestamp: nowIso(),
  };
}

export function policyRecord(input: Obj, overrides: Obj = {}): Obj {
  const timestamp = nowIso();
  return {
    created_at: timestamp,
    definition: input.definition ?? {},
    definition_format: input.definition_format ?? "json_schema",
    description: input.description,
    id: newId("pol"),
    name: input.name ?? "policy",
    status: "active",
    updated_at: timestamp,
    version: 1,
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
      limit,
      total: items.length,
    },
  };
}
