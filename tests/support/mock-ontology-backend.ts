import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * In-memory stand-in for the ontology objects endpoints. It implements the
 * production spec (docs/backend-spec/ontology-openapi.yaml) plus the proposed
 * additions in docs/backend-spec/CONTRACT-v2.md: revisions with ETag and
 * If-Match, structured query with cursor paging, typed object-type schemas and
 * `code` on the new errors.
 *
 * Auth is mocked: a request must carry `Authorization: Bearer <token>` or
 * `x-api-key: <token>` equal to the configured token, otherwise it gets 401.
 * Nothing here is a real Frontal service; it exists so the CLI and SDK can be
 * exercised over real HTTP without credentials.
 */

/** The token the mock accepts by default. It starts with `frt_`, as the SDK requires. */
export const MOCK_TOKEN = "frt_mock_0123456789";

export interface MockObjectType {
  name: string;
  object_type_id: string;
  schema: Record<string, unknown>;
}

export interface MockObject {
  object_id: string;
  object_type_id: string;
  properties: Record<string, unknown>;
}

export interface RecordedRequest {
  authorized: boolean;
  method: string;
  path: string;
}

export interface MockOptions {
  objects?: MockObject[];
  objectTypes?: MockObjectType[];
  token?: string;
}

/** A relationship instance (contract v2, section 5). */
export interface MockRelationship {
  properties: Record<string, unknown>;
  relationship_id: string;
  relationship_type_id: string;
  source_object_id: string;
  target_object_id: string;
}

export interface MockOntologyBackend {
  objects: () => MockObject[];
  objectTypes: () => MockObjectType[];
  relationships: () => MockRelationship[];
  /** Every request received, in order, including rejected ones. */
  requests: () => RecordedRequest[];
  /** Replaces the object types, as a Frontal Studio edit would. Not validated. */
  setObjectTypes: (objectTypes: MockObjectType[]) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  readonly token: string;
  /** Base URL including `/v1`, for example `http://127.0.0.1:41234/v1`. Set after `start()`. */
  readonly url: string;
}

type Json = Record<string, unknown>;
type Scalar = string | number | boolean;

interface Reply {
  body?: unknown;
  headers?: Record<string, string>;
  status: number;
}

type Result<T> = { ok: true; value: T } | { ok: false; reply: Reply };

const FIELD_TYPES = [
  "string",
  "text",
  "uuid",
  "integer",
  "float",
  "currency",
  "boolean",
  "timestamp",
  "enum",
  "array",
  "json",
  "vector",
] as const;
type FieldType = (typeof FIELD_TYPES)[number];

const RELATION_TYPES = ["belongsTo", "hasOne", "hasMany", "manyToMany"];

type Operator =
  | "eq"
  | "in"
  | "contains"
  | "startsWith"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

/** Operators each field type accepts (contract v2, section 2). */
const OPERATORS_BY_TYPE: Partial<Record<FieldType, readonly Operator[]>> = {
  boolean: ["eq"],
  currency: ["eq", "in", "gt", "gte", "lt", "lte"],
  enum: ["eq", "in"],
  float: ["eq", "in", "gt", "gte", "lt", "lte"],
  integer: ["eq", "in", "gt", "gte", "lt", "lte"],
  string: ["eq", "in", "contains", "startsWith"],
  text: ["eq", "in", "contains", "startsWith"],
  timestamp: ["eq", "gt", "gte", "lt", "lte"],
  uuid: ["eq", "in", "contains", "startsWith"],
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const OBJECT_TYPE_PATH = /^\/ontology\/objects\/object-types\/([^/]+)$/;
const OBJECT_PATH = /^\/ontology\/objects\/objects\/([^/]+)$/;
const RELATIONSHIP_PATH = /^\/ontology\/relationships\/relationships\/([^/]+)$/;
/** Relation kinds that resolve through relationship instances (contract v2, section 5). */
const RELATIONSHIP_KINDS = ["hasOne", "hasMany", "manyToMany"];
const ETAG_PATTERN = /^"(\d+)"$/;

/**
 * ASSUMPTION (not in the spec): on each object write the backend fills fields
 * the object type declares as absent: `default` values, and `auto` timestamps.
 * Without this the SDK's runtime check rejects reads of required fields the
 * caller was never asked to send.
 */
function withSchemaDefaults(
  schema: Json | undefined,
  properties: Json,
  now: string
): Json {
  const fields = schema && isRecord(schema.fields) ? schema.fields : {};
  const filled: Json = { ...properties };
  for (const [name, raw] of Object.entries(fields)) {
    if (filled[name] !== undefined || !isRecord(raw)) {
      continue;
    }
    if (raw.default !== undefined) {
      filled[name] = raw.default;
    } else if (raw.auto === true && raw.type === "timestamp") {
      filled[name] = now;
    }
  }
  return filled;
}

function detail(message: string): Json {
  return { detail: message };
}

/** A v2 error: stable `code` plus human `detail` (contract v2, section 4). */
function coded(status: number, code: string, message: string): Reply {
  return { body: { code, detail: message }, status };
}

function validationError(field: string): Json {
  return {
    detail: [
      {
        input: null,
        loc: ["body", field],
        msg: "Field required",
        type: "missing",
      },
    ],
  };
}

/** The body as an object, or an empty one when it is not. */
function asRecord(value: unknown): Json {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the request body as JSON. Returns undefined when the body is empty or invalid. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function presentedToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  const key = req.headers["x-api-key"];
  return typeof key === "string" ? key : undefined;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function etagOf(revision: number): string {
  return `"${revision}"`;
}

/** Parsed `If-Match` (contract v2, section 1). */
type Condition =
  | { kind: "none" }
  | { kind: "any" }
  | { kind: "revision"; revision: number }
  | { kind: "invalid" };

function parseIfMatch(raw: string | undefined): Condition {
  if (raw === undefined) {
    return { kind: "none" };
  }
  const value = raw.trim();
  if (value === "*") {
    return { kind: "any" };
  }
  const match = ETAG_PATTERN.exec(value);
  return match
    ? { kind: "revision", revision: Number(match[1]) }
    : { kind: "invalid" };
}

function fieldsOf(type: MockObjectType): Record<string, unknown> {
  return isRecord(type.schema.fields) ? type.schema.fields : {};
}

/** Checks a value against a field's declared type. */
function validValue(field: Json, value: unknown): boolean {
  switch (field.type) {
    case "string":
    case "text":
    case "uuid":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "float":
    case "currency":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "timestamp":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "enum":
      return (
        typeof value === "string" &&
        Array.isArray(field.enum) &&
        field.enum.includes(value)
      );
    default:
      return false;
  }
}

/** Reduces a stored or query value to a comparable scalar, or undefined when its type does not fit. */
function scalarOf(field: Json, value: unknown): Scalar | undefined {
  switch (field.type) {
    case "timestamp": {
      if (typeof value !== "string") {
        return undefined;
      }
      const time = Date.parse(value);
      return Number.isNaN(time) ? undefined : time;
    }
    case "integer":
    case "float":
    case "currency":
      return typeof value === "number" ? value : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "string":
    case "text":
    case "uuid":
    case "enum":
      return typeof value === "string" ? value : undefined;
    default:
      return undefined;
  }
}

/** Returns why an operand is not acceptable for an operator, or undefined when it is. */
function operandProblem(
  field: Json,
  op: Operator,
  operand: unknown
): string | undefined {
  if (op === "in") {
    if (!Array.isArray(operand) || operand.length === 0) {
      return "in needs a non-empty array";
    }
    return operand.every((value) => validValue(field, value))
      ? undefined
      : "in contains a value of the wrong type";
  }
  if (op === "contains" || op === "startsWith") {
    return typeof operand === "string" ? undefined : `${op} needs a string`;
  }
  return validValue(field, operand)
    ? undefined
    : `${op} needs a value of the wrong type`;
}

interface FilterCondition {
  field: Json;
  name: string;
  op: Operator;
  operand: Scalar | Scalar[];
}

/** Parses one property's operator map into conditions, or the first error. */
function parseOperators(
  name: string,
  field: Json,
  ops: unknown
): Result<FilterCondition[]> {
  const fieldType = String(field.type) as FieldType;
  const allowed = OPERATORS_BY_TYPE[fieldType] ?? [];
  if (allowed.length === 0) {
    return fail(
      "INVALID_OPERATOR",
      `property "${name}" (${fieldType}) cannot be filtered`
    );
  }
  if (!isRecord(ops) || Object.keys(ops).length === 0) {
    return fail(
      "INVALID_OPERATOR",
      `filter on "${name}" needs at least one operator`
    );
  }
  const conditions: FilterCondition[] = [];
  for (const [op, operand] of Object.entries(ops)) {
    if (!(allowed as readonly string[]).includes(op)) {
      return fail(
        "INVALID_OPERATOR",
        `operator "${op}" is not allowed for "${name}" (${fieldType})`
      );
    }
    const problem = operandProblem(field, op as Operator, operand);
    if (problem !== undefined) {
      return fail("INVALID_OPERATOR", `${problem} (property "${name}")`);
    }
    conditions.push({
      field,
      name,
      op: op as Operator,
      operand: Array.isArray(operand)
        ? operand.map((value) => scalarOf(field, value) as Scalar)
        : (scalarOf(field, operand) as Scalar),
    });
  }
  return { ok: true, value: conditions };
}

function fail<T>(code: string, message: string): Result<T> {
  return { ok: false, reply: coded(422, code, message) };
}

/** Parses the `filter` object into conditions, or the first error. */
function parseFilter(
  filter: unknown,
  typeName: string,
  fields: Record<string, unknown>
): Result<FilterCondition[]> {
  if (filter === undefined) {
    return { ok: true, value: [] };
  }
  if (!isRecord(filter)) {
    return fail("VALIDATION_ERROR", "filter must be an object");
  }
  const conditions: FilterCondition[] = [];
  for (const [name, ops] of Object.entries(filter)) {
    const field = Object.hasOwn(fields, name) ? fields[name] : undefined;
    if (!isRecord(field)) {
      return fail(
        "UNKNOWN_PROPERTY",
        `unknown property "${name}" on ${typeName}`
      );
    }
    const parsed = parseOperators(name, field, ops);
    if (!parsed.ok) {
      return parsed;
    }
    conditions.push(...parsed.value);
  }
  return { ok: true, value: conditions };
}

const RANGE_OPS: Partial<Record<Operator, (a: number, b: number) => boolean>> =
  {
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
  };

const TEXT_OPS: Partial<Record<Operator, (a: string, b: string) => boolean>> = {
  contains: (a, b) => a.includes(b),
  startsWith: (a, b) => a.startsWith(b),
};

function matchesCondition(
  record: MockObject,
  condition: FilterCondition
): boolean {
  const { name, op, operand, field } = condition;
  const stored = scalarOf(field, record.properties[name]);
  if (stored === undefined) {
    return false;
  }
  if (op === "eq") {
    return stored === operand;
  }
  if (op === "in") {
    return Array.isArray(operand) && operand.includes(stored);
  }
  const range = RANGE_OPS[op];
  if (range) {
    return (
      typeof stored === "number" &&
      typeof operand === "number" &&
      range(stored, operand)
    );
  }
  const text = TEXT_OPS[op];
  if (text) {
    return (
      typeof stored === "string" &&
      typeof operand === "string" &&
      text(stored, operand)
    );
  }
  return false;
}

function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function encodeCursor(objectTypeId: string, afterId: string): string {
  return Buffer.from(
    JSON.stringify({ after: afterId, object_type_id: objectTypeId })
  ).toString("base64url");
}

/** Decodes a cursor for one object type, or undefined when it is not one of ours. */
function decodeCursor(
  cursor: string,
  objectTypeId: string
): string | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8")
    );
    if (
      isRecord(parsed) &&
      typeof parsed.after === "string" &&
      parsed.object_type_id === objectTypeId
    ) {
      return parsed.after;
    }
  } catch {
    // fall through: not a cursor we issued
  }
  return undefined;
}

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined) {
    return DEFAULT_LIMIT;
  }
  return Number.isInteger(raw) &&
    (raw as number) >= 1 &&
    (raw as number) <= MAX_LIMIT
    ? (raw as number)
    : undefined;
}

/** Runs a structured query (contract v2, section 2). */
function runQuery(
  types: MockObjectType[],
  objects: MockObject[],
  body: unknown
): Reply {
  const input = asRecord(body);
  if (typeof input.object_type_id !== "string" || input.object_type_id === "") {
    return { body: validationError("object_type_id"), status: 422 };
  }
  const type = types.find(
    (candidate) => candidate.object_type_id === input.object_type_id
  );
  if (!type) {
    return coded(404, "NOT_FOUND", "Object type not found");
  }
  const limit = parseLimit(input.limit);
  if (limit === undefined) {
    return coded(
      422,
      "VALIDATION_ERROR",
      `limit must be an integer from 1 to ${MAX_LIMIT}`
    );
  }
  const parsed = parseFilter(input.filter, type.name, fieldsOf(type));
  if (!parsed.ok) {
    return parsed.reply;
  }
  let after: string | undefined;
  if (input.cursor !== undefined) {
    after =
      typeof input.cursor === "string"
        ? decodeCursor(input.cursor, type.object_type_id)
        : undefined;
    if (after === undefined) {
      return coded(422, "INVALID_CURSOR", "cursor is not valid for this query");
    }
  }
  const matching = objects
    .filter(
      (object) =>
        object.object_type_id === type.object_type_id &&
        parsed.value.every((condition) => matchesCondition(object, condition))
    )
    .sort((a, b) => compareIds(a.object_id, b.object_id))
    .filter((object) => after === undefined || object.object_id > after);
  const page = matching.slice(0, limit);
  const last = page.at(-1);
  const next =
    matching.length > limit && last !== undefined
      ? encodeCursor(type.object_type_id, last.object_id)
      : null;
  return {
    body: {
      next_cursor: next,
      results: page.map((object) => structuredClone(object)),
    },
    status: 200,
  };
}

/** Returns the first problem with one schema field, or undefined. */
function fieldProblem(where: string, raw: unknown): string | undefined {
  if (!isRecord(raw)) {
    return `${where} must be an object`;
  }
  if (
    typeof raw.type !== "string" ||
    !(FIELD_TYPES as readonly string[]).includes(raw.type)
  ) {
    return `${where}.type "${String(raw.type)}" is not a known field type`;
  }
  for (const flag of ["required", "primary", "auto", "computed"]) {
    if (raw[flag] !== undefined && typeof raw[flag] !== "boolean") {
      return `${where}.${flag} must be a boolean`;
    }
  }
  if (raw.type === "enum" && !isNonEmptyStringArray(raw.enum)) {
    return `${where}.enum must be a non-empty array of strings for an enum field`;
  }
  if (raw.items !== undefined) {
    if (raw.type !== "array") {
      return `${where}.items is only allowed on array fields`;
    }
    if (
      typeof raw.items !== "string" ||
      !(FIELD_TYPES as readonly string[]).includes(raw.items)
    ) {
      return `${where}.items must be a known field type`;
    }
  }
  return undefined;
}

function isNonEmptyStringArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "string")
  );
}

/** Returns the first problem with one relationship, or undefined. */
function relationshipProblem(
  where: string,
  raw: unknown,
  knownNames: ReadonlySet<string>
): string | undefined {
  if (!isRecord(raw)) {
    return `${where} must be an object`;
  }
  if (typeof raw.type !== "string" || !RELATION_TYPES.includes(raw.type)) {
    return `${where}.type "${String(raw.type)}" is not a known relationship type`;
  }
  if (typeof raw.targetEntity !== "string" || raw.targetEntity === "") {
    return `${where}.targetEntity is required`;
  }
  if (!knownNames.has(raw.targetEntity)) {
    return `${where}.targetEntity "${raw.targetEntity}" is not an object type in this ontology`;
  }
  if (raw.foreignKey !== undefined && typeof raw.foreignKey !== "string") {
    return `${where}.foreignKey must be a string`;
  }
  const needsType = RELATIONSHIP_KINDS.includes(raw.type);
  if (needsType && raw.relationshipTypeId === undefined) {
    return `${where}.relationshipTypeId is required for ${raw.type}`;
  }
  if (
    raw.relationshipTypeId !== undefined &&
    (typeof raw.relationshipTypeId !== "string" ||
      raw.relationshipTypeId === "")
  ) {
    return `${where}.relationshipTypeId must be a non-empty string`;
  }
  return undefined;
}

/**
 * Checks an object type's schema against `ObjectTypeSchema` (contract v2,
 * section 3). Returns the first problem, or undefined when valid.
 */
function schemaProblem(
  schema: Json,
  knownNames: ReadonlySet<string>
): string | undefined {
  if (!isRecord(schema.fields)) {
    return "schema.fields is required and must be an object";
  }
  for (const [name, raw] of Object.entries(schema.fields)) {
    const problem = fieldProblem(`schema.fields.${name}`, raw);
    if (problem !== undefined) {
      return problem;
    }
  }
  if (schema.relationships !== undefined) {
    if (!isRecord(schema.relationships)) {
      return "schema.relationships must be an object";
    }
    for (const [name, raw] of Object.entries(schema.relationships)) {
      const problem = relationshipProblem(
        `schema.relationships.${name}`,
        raw,
        knownNames
      );
      if (problem !== undefined) {
        return problem;
      }
    }
  }
  if (schema.version !== undefined && !Number.isInteger(schema.version)) {
    return "schema.version must be an integer";
  }
  return undefined;
}

/** Creates the mock. Call `start()` before reading `url`. */
export function createMockOntologyBackend(
  options: MockOptions = {}
): MockOntologyBackend {
  const token = options.token ?? MOCK_TOKEN;
  let types: MockObjectType[] = structuredClone(options.objectTypes ?? []);
  const records = new Map<string, MockObject>();
  const relationships = new Map<string, MockRelationship>();
  /** Monotonic per object id, so a deleted and recreated object never reuses a revision. */
  const revisions = new Map<string, number>();
  for (const object of options.objects ?? []) {
    records.set(object.object_id, structuredClone(object));
    revisions.set(object.object_id, 1);
  }
  const log: RecordedRequest[] = [];
  let server: Server | undefined;
  let baseUrl: string | undefined;

  function findType(id: string): MockObjectType | undefined {
    return types.find((type) => type.object_type_id === id);
  }

  function revisionOf(id: string): number {
    return revisions.get(id) ?? 0;
  }

  function upsertType(id: string, body: Json): Reply {
    const name = typeof body.name === "string" ? body.name : undefined;
    if (name === undefined || name === "") {
      return { body: validationError("name"), status: 422 };
    }
    const schema = isRecord(body.schema) ? body.schema : {};
    const knownNames = new Set([...types.map((type) => type.name), name]);
    const problem = schemaProblem(schema, knownNames);
    if (problem !== undefined) {
      return coded(422, "INVALID_SCHEMA", problem);
    }
    const record: MockObjectType = { name, object_type_id: id, schema };
    types = [...types.filter((type) => type.object_type_id !== id), record];
    return { body: record, status: 200 };
  }

  /** Stores an object and bumps its revision. */
  function writeObject(
    id: string,
    objectTypeId: string,
    properties: unknown
  ): MockObject {
    const sent = isRecord(properties) ? properties : {};
    const record: MockObject = {
      object_id: id,
      object_type_id: objectTypeId,
      properties: withSchemaDefaults(
        findType(objectTypeId)?.schema,
        sent,
        new Date().toISOString()
      ),
    };
    records.set(id, record);
    revisions.set(id, revisionOf(id) + 1);
    return record;
  }

  /** PUT an object: validates the body, then applies If-Match (contract v2, section 1). */
  function putObject(
    id: string,
    body: unknown,
    ifMatch: string | undefined
  ): Reply {
    if (
      !isRecord(body) ||
      typeof body.object_type_id !== "string" ||
      body.object_type_id === ""
    ) {
      return { body: validationError("object_type_id"), status: 422 };
    }
    const condition = parseIfMatch(ifMatch);
    if (condition.kind !== "none") {
      if (!records.has(id)) {
        return coded(404, "NOT_FOUND", "Object not found");
      }
      const current = revisionOf(id);
      const matches =
        condition.kind === "any" ||
        (condition.kind === "revision" && condition.revision === current);
      if (!matches) {
        return {
          body: {
            code: "PRECONDITION_FAILED",
            current_revision: current,
            detail: `If-Match does not match the current revision ${current}`,
          },
          status: 412,
        };
      }
    }
    const record = writeObject(id, body.object_type_id, body.properties);
    return {
      body: record,
      headers: { ETag: etagOf(revisionOf(id)) },
      status: 200,
    };
  }

  function createObject(body: unknown): Reply {
    if (
      !isRecord(body) ||
      typeof body.object_type_id !== "string" ||
      body.object_type_id === ""
    ) {
      return { body: validationError("object_type_id"), status: 422 };
    }
    const id =
      typeof body.object_id === "string" && body.object_id !== ""
        ? body.object_id
        : randomUUID();
    return {
      body: writeObject(id, body.object_type_id, body.properties),
      status: 201,
    };
  }

  function notFound(message: string): Reply {
    return { body: detail(message), status: 404 };
  }

  async function routeObjectType(
    method: string,
    id: string,
    req: IncomingMessage
  ): Promise<Reply> {
    if (method === "GET") {
      const found = findType(id);
      return found
        ? { body: found, status: 200 }
        : notFound("Object type not found");
    }
    if (method === "PUT") {
      return upsertType(id, asRecord(await readJson(req)));
    }
    if (method === "DELETE") {
      if (!findType(id)) {
        return notFound("Object type not found");
      }
      types = types.filter((type) => type.object_type_id !== id);
      return { status: 204 };
    }
    return notFound("Not Found");
  }

  async function routeObjects(
    method: string,
    query: URLSearchParams,
    req: IncomingMessage
  ): Promise<Reply> {
    if (method === "GET") {
      const filter = query.get("object_type_id");
      const listed = [...records.values()].filter(
        (record) => !filter || record.object_type_id === filter
      );
      return { body: listed, status: 200 };
    }
    if (method === "POST") {
      return createObject(await readJson(req));
    }
    return notFound("Not Found");
  }

  async function routeObjectsQuery(
    method: string,
    req: IncomingMessage
  ): Promise<Reply> {
    if (method !== "POST") {
      return notFound("Not Found");
    }
    return runQuery(types, [...records.values()], await readJson(req));
  }

  async function routeObject(
    method: string,
    id: string,
    req: IncomingMessage
  ): Promise<Reply> {
    if (method === "GET") {
      const found = records.get(id);
      return found
        ? {
            body: found,
            headers: { ETag: etagOf(revisionOf(id)) },
            status: 200,
          }
        : notFound("Object not found");
    }
    if (method === "PUT") {
      return putObject(id, await readJson(req), headerValue(req, "if-match"));
    }
    if (method === "DELETE") {
      if (!records.has(id)) {
        return notFound("Object not found");
      }
      records.delete(id);
      return { status: 204 };
    }
    return notFound("Not Found");
  }

  /** Creates a relationship instance after checking both objects exist. */
  function createRelationship(body: unknown): Reply {
    if (!isRecord(body)) {
      return { body: validationError("body"), status: 422 };
    }
    for (const field of [
      "relationship_type_id",
      "source_object_id",
      "target_object_id",
    ] as const) {
      const value = body[field];
      if (typeof value !== "string" || value === "") {
        return { body: validationError(field), status: 422 };
      }
    }
    const source = String(body.source_object_id);
    const target = String(body.target_object_id);
    for (const id of [source, target]) {
      if (!records.has(id)) {
        return coded(422, "UNKNOWN_OBJECT", `Object "${id}" does not exist`);
      }
    }
    const id =
      typeof body.relationship_id === "string" && body.relationship_id !== ""
        ? body.relationship_id
        : randomUUID();
    if (relationships.has(id)) {
      return coded(
        409,
        "ALREADY_EXISTS",
        `Relationship "${id}" already exists`
      );
    }
    const record: MockRelationship = {
      properties: isRecord(body.properties) ? body.properties : {},
      relationship_id: id,
      relationship_type_id: String(body.relationship_type_id),
      source_object_id: source,
      target_object_id: target,
    };
    relationships.set(id, record);
    return { body: record, status: 201 };
  }

  /** Lists relationship instances matching every filter given (unpaged, insertion order). */
  function listRelationships(query: URLSearchParams): Reply {
    const objectId = query.get("object_id");
    const source = query.get("source_object_id");
    const target = query.get("target_object_id");
    const type = query.get("relationship_type_id");
    const listed = [...relationships.values()].filter(
      (record) =>
        (!objectId ||
          record.source_object_id === objectId ||
          record.target_object_id === objectId) &&
        (!source || record.source_object_id === source) &&
        (!target || record.target_object_id === target) &&
        (!type || record.relationship_type_id === type)
    );
    return { body: listed, status: 200 };
  }

  function deleteRelationship(id: string): Reply {
    if (!relationships.has(id)) {
      return coded(404, "NOT_FOUND", "Relationship not found");
    }
    relationships.delete(id);
    return { status: 204 };
  }

  /** Routes the relationship-instance endpoints (contract v2, section 5). */
  function routeRelationships(
    method: string,
    path: string,
    query: URLSearchParams,
    req: IncomingMessage
  ): Promise<Reply> {
    if (path === "/ontology/relationships/relationships") {
      if (method === "GET") {
        return Promise.resolve(listRelationships(query));
      }
      if (method === "POST") {
        return readJson(req).then((body) => createRelationship(body));
      }
      return Promise.resolve(notFound("Not Found"));
    }
    const match = RELATIONSHIP_PATH.exec(path);
    if (match && method === "DELETE") {
      return Promise.resolve(
        deleteRelationship(decodeURIComponent(match[1] ?? ""))
      );
    }
    return Promise.resolve(notFound("Not Found"));
  }

  /** Routes one authorised request. Paths are relative to `/v1`. */
  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    req: IncomingMessage
  ): Promise<Reply> {
    if (path === "/ontology/objects/object-types" && method === "GET") {
      return Promise.resolve({ body: types, status: 200 });
    }
    const typeMatch = OBJECT_TYPE_PATH.exec(path);
    if (typeMatch) {
      return routeObjectType(
        method,
        decodeURIComponent(typeMatch[1] ?? ""),
        req
      );
    }
    if (path === "/ontology/objects/objects") {
      return routeObjects(method, query, req);
    }
    if (path === "/ontology/objects/objects/query") {
      return routeObjectsQuery(method, req);
    }
    const objectMatch = OBJECT_PATH.exec(path);
    if (objectMatch) {
      return routeObject(method, decodeURIComponent(objectMatch[1] ?? ""), req);
    }
    if (path.startsWith("/ontology/relationships/relationships")) {
      return routeRelationships(method, path, query, req);
    }
    return Promise.resolve(notFound("Not Found"));
  }

  function send(res: ServerResponse, reply: Reply): void {
    const headers = reply.headers ?? {};
    if (reply.body === undefined) {
      res.writeHead(reply.status, headers).end();
      return;
    }
    res
      .writeHead(reply.status, {
        ...headers,
        "content-type": "application/json",
      })
      .end(JSON.stringify(reply.body));
  }

  async function handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://mock.local");
    const authorized = presentedToken(req) === token;
    log.push({ authorized, method, path: url.pathname });
    if (!authorized) {
      // Drain the body so the connection is reusable before the 401 is sent.
      req.resume();
      send(res, { body: detail("Invalid or missing API key"), status: 401 });
      return;
    }
    if (!url.pathname.startsWith("/v1/")) {
      send(res, { body: detail("Not Found"), status: 404 });
      return;
    }
    const path = url.pathname.slice("/v1".length);
    send(res, await route(method, path, url.searchParams, req));
  }

  return {
    objects: () =>
      [...records.values()].map((record) => structuredClone(record)),
    objectTypes: () => structuredClone(types),
    relationships: () =>
      [...relationships.values()].map((record) => structuredClone(record)),
    requests: () => log.map((entry) => ({ ...entry })),

    setObjectTypes(objectTypes: MockObjectType[]): void {
      types = structuredClone(objectTypes);
    },

    start(): Promise<void> {
      server = createServer((req, res) => {
        handle(req, res).catch((err: unknown) => {
          send(res, { body: detail(String(err)), status: 500 });
        });
      });
      return new Promise((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(0, "127.0.0.1", () => {
          const address = server?.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${address.port}/v1`;
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      const running = server;
      server = undefined;
      baseUrl = undefined;
      if (!running) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        running.close((err) => (err ? reject(err) : resolve()));
      });
    },
    token,
    get url(): string {
      if (baseUrl === undefined) {
        throw new Error("The mock backend is not started. Call start() first.");
      }
      return baseUrl;
    },
  };
}
