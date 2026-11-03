import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * In-memory stand-in for the ontology objects endpoints of the backend contract
 * (docs/backend-spec/ontology-openapi.yaml). It speaks the spec's wire format:
 * snake_case JSON, unpaged lists and `{ detail }` errors.
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

export interface MockOntologyBackend {
  objects: () => MockObject[];
  objectTypes: () => MockObjectType[];
  /** Every request received, in order, including rejected ones. */
  requests: () => RecordedRequest[];
  /** Replaces the object types, as a Frontal Studio edit would. */
  setObjectTypes: (objectTypes: MockObjectType[]) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  readonly token: string;
  /** Base URL including `/v1`, for example `http://127.0.0.1:41234/v1`. Set after `start()`. */
  readonly url: string;
}

type Json = Record<string, unknown>;

interface Reply {
  body?: unknown;
  status: number;
}

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

const OBJECT_TYPE_PATH = /^\/ontology\/objects\/object-types\/([^/]+)$/;
const OBJECT_PATH = /^\/ontology\/objects\/objects\/([^/]+)$/;

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

/** Creates the mock. Call `start()` before reading `url`. */
export function createMockOntologyBackend(
  options: MockOptions = {}
): MockOntologyBackend {
  const token = options.token ?? MOCK_TOKEN;
  let types: MockObjectType[] = structuredClone(options.objectTypes ?? []);
  const records = new Map<string, MockObject>();
  for (const object of options.objects ?? []) {
    records.set(object.object_id, structuredClone(object));
  }
  const log: RecordedRequest[] = [];
  let server: Server | undefined;
  let baseUrl: string | undefined;

  function findType(id: string): MockObjectType | undefined {
    return types.find((type) => type.object_type_id === id);
  }

  function upsertType(id: string, body: Json): Reply {
    const name = typeof body.name === "string" ? body.name : undefined;
    if (name === undefined || name === "") {
      return { body: validationError("name"), status: 422 };
    }
    const schema = isRecord(body.schema) ? body.schema : {};
    const record: MockObjectType = { name, object_type_id: id, schema };
    types = [...types.filter((type) => type.object_type_id !== id), record];
    return { body: record, status: 200 };
  }

  function putObject(id: string, body: unknown): Reply {
    if (!isRecord(body)) {
      return { body: validationError("object_type_id"), status: 422 };
    }
    if (typeof body.object_type_id !== "string" || body.object_type_id === "") {
      return { body: validationError("object_type_id"), status: 422 };
    }
    const record: MockObject = {
      object_id: id,
      object_type_id: body.object_type_id,
      properties: materialize(body.object_type_id, body.properties),
    };
    records.set(id, record);
    return { body: record, status: 200 };
  }

  /** Applies the object type's defaults and auto fields to the properties a client sent. */
  function materialize(objectTypeId: string, properties: unknown): Json {
    const sent = isRecord(properties) ? properties : {};
    return withSchemaDefaults(
      findType(objectTypeId)?.schema,
      sent,
      new Date().toISOString()
    );
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
    const record: MockObject = {
      object_id: id,
      object_type_id: body.object_type_id,
      properties: materialize(body.object_type_id, body.properties),
    };
    records.set(id, record);
    return { body: record, status: 201 };
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

  async function routeObject(
    method: string,
    id: string,
    req: IncomingMessage
  ): Promise<Reply> {
    if (method === "GET") {
      const found = records.get(id);
      return found
        ? { body: found, status: 200 }
        : notFound("Object not found");
    }
    if (method === "PUT") {
      return putObject(id, await readJson(req));
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
    const objectMatch = OBJECT_PATH.exec(path);
    if (objectMatch) {
      return routeObject(method, decodeURIComponent(objectMatch[1] ?? ""), req);
    }
    return Promise.resolve(notFound("Not Found"));
  }

  function send(res: ServerResponse, reply: Reply): void {
    if (reply.body === undefined) {
      res.writeHead(reply.status).end();
      return;
    }
    res
      .writeHead(reply.status, { "content-type": "application/json" })
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
