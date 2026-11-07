/**
 * A test double for `@frontal-labs/sdk`, covering the surface the ontology
 * suites use:
 *
 * - `new Frontal(config, runtime?)`, typed from the `FrontalOntologyRegistry`
 *   interface that a generated `ontology.d.ts` augments.
 * - `createFrontalClient(config, runtime)`, used by the generated client.
 * - Typed entity clients (`list`, `get`, `create`, `put`, `update`, `delete`)
 *   and relation accessors on read objects.
 *
 * It talks real HTTP to the ontology mock backend
 * (tests/support/mock-ontology-backend.ts), so the wire shapes are exercised.
 * Without a runtime argument it reads the object type names and ids once from
 * the backend, but it does not learn relations. Relations need the generated
 * runtime metadata. This is a test double, not a replacement for the SDK.
 */

export interface SdkConfig {
  apiKey: string;
  baseUrl?: string;
}

/** Runtime metadata the generated client passes in (see `runtime` in .frontal/client.ts). */
export interface RuntimeMeta {
  entities: readonly string[];
  objectTypeIds: Readonly<Record<string, string>>;
  relations: Readonly<Record<string, Readonly<Record<string, RelationMeta>>>>;
}

export interface RelationMeta {
  cardinality: "belongsTo" | "hasOne" | "hasMany" | "manyToMany";
  foreignKey?: string;
  optional?: boolean;
  relationshipTypeId?: string;
  target: string;
}

/** One entity in a generated `Ontology` interface. */
export interface EntityDef {
  create: object;
  read: object;
  relations: object;
  update: object;
}

/**
 * Generated `ontology.d.ts` files augment this interface with their `Ontology`,
 * so `new Frontal(config)` is typed without a generated client.
 */
// biome-ignore lint/suspicious/noEmptyInterface: an empty interface is the augmentation target
export interface FrontalOntologyRegistry {}

type ReadOf<O, E extends keyof O> = O[E] extends { read: infer R } ? R : never;

type RelationsOf<O, E extends keyof O> = O[E] extends { relations: infer R }
  ? R
  : object;

type RelationMethod<O, R> = R extends {
  target: infer T extends keyof O;
  cardinality: infer C;
}
  ? C extends "belongsTo" | "hasOne"
    ? () => Promise<ReadOf<O, T> | null>
    : () => Promise<ReadOf<O, T>[]>
  : never;

/** A read object: the entity's fields plus one method per declared relation. */
export type EntityRead<O, E extends keyof O> = ReadOf<O, E> & {
  [K in keyof RelationsOf<O, E>]: RelationMethod<O, RelationsOf<O, E>[K]>;
};

/** The typed client for one entity. */
export interface EntityClient<O, E extends keyof O> {
  create: (
    input: O[E] extends { create: infer C } ? C : never
  ) => Promise<EntityRead<O, E>>;
  delete: (id: string) => Promise<void>;
  get: (id: string) => Promise<EntityRead<O, E>>;
  list: () => Promise<EntityRead<O, E>[]>;
  put: (
    id: string,
    input: O[E] extends { create: infer C } ? C : never
  ) => Promise<EntityRead<O, E>>;
  update: (
    id: string,
    patch: O[E] extends { update: infer U } ? U : never
  ) => Promise<EntityRead<O, E>>;
}

/** A non-2xx response from the backend. */
export class FrontalMockError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(`${status} ${code}: ${message}`);
    this.name = "FrontalMockError";
    this.status = status;
    this.code = code;
  }
}

interface WireObject {
  object_id: string;
  object_type_id: string;
  properties: Record<string, unknown>;
}

interface WireObjectType {
  name: string;
  object_type_id: string;
}

interface WireRelationship {
  source_object_id: string;
  target_object_id: string;
}

const DEFAULT_BASE_URL = "https://api.frontal.dev/v1";
const TRAILING_SLASH = /\/$/;

/** Flattens a wire object into the entity shape the generated types describe. */
function flatten(record: WireObject): Record<string, unknown> {
  return { id: record.object_id, ...record.properties };
}

export class Frontal<O = FrontalOntologyRegistry> {
  readonly #config: SdkConfig;
  readonly #baseUrl: string;
  readonly #runtime: Promise<RuntimeMeta>;
  readonly #clients = new Map<string, Record<string, unknown>>();
  readonly #ontology: { [E in keyof O & string]: EntityClient<O, E> };

  constructor(config: SdkConfig, runtime?: RuntimeMeta) {
    this.#config = config;
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(
      TRAILING_SLASH,
      ""
    );
    this.#runtime = runtime ? Promise.resolve(runtime) : this.#loadRuntime();
    // Entity names are only known once the runtime is, so resolve them lazily.
    this.#ontology = new Proxy(
      {} as { [E in keyof O & string]: EntityClient<O, E> },
      {
        get: (_target, entity) =>
          typeof entity === "string" ? this.#client(entity) : undefined,
      }
    );
  }

  get ontology(): { [E in keyof O & string]: EntityClient<O, E> } {
    return this.#ontology;
  }

  /** Reads the object type names and ids once, the way the SDK does without a runtime argument. */
  async #loadRuntime(): Promise<RuntimeMeta> {
    const types = (await this.request(
      "GET",
      "/ontology/objects/object-types"
    )) as WireObjectType[];
    const objectTypeIds: Record<string, string> = {};
    for (const type of types) {
      objectTypeIds[type.name] = type.object_type_id;
    }
    return {
      entities: types.map((type) => type.name),
      objectTypeIds,
      relations: {},
    };
  }

  async request(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, string> } = {}
  ): Promise<unknown> {
    const url = new URL(`${this.#baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Authorization: `Bearer ${this.#config.apiKey}`,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      method,
    });
    if (response.status === 204) {
      return undefined;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new FrontalMockError(
        response.status,
        typeof payload.code === "string" ? payload.code : "ERROR",
        typeof payload.message === "string"
          ? payload.message
          : response.statusText
      );
    }
    return payload;
  }

  /** The typed client for one entity, created on first access. */
  #client(entity: string): Record<string, unknown> {
    const existing = this.#clients.get(entity);
    if (existing) {
      return existing;
    }
    const client = this.#entityClient(entity);
    this.#clients.set(entity, client);
    return client;
  }

  #entityClient(entity: string): Record<string, unknown> {
    const runtime = async (): Promise<RuntimeMeta> => {
      const meta = await this.#runtime;
      if (!meta.entities.includes(entity)) {
        throw new Error(`Unknown entity "${entity}"`);
      }
      return meta;
    };
    const objectTypeId = async (): Promise<string> => {
      const id = (await runtime()).objectTypeIds[entity];
      if (id === undefined) {
        throw new Error(`No object type id for entity "${entity}"`);
      }
      return id;
    };
    const wrap = async (record: WireObject): Promise<Record<string, unknown>> =>
      this.#withRelations(await runtime(), entity, flatten(record), record);
    const fetchOne = (id: string): Promise<WireObject> =>
      this.request(
        "GET",
        `/ontology/objects/objects/${encodeURIComponent(id)}`
      ) as Promise<WireObject>;
    const objectPath = (id: string): string =>
      `/ontology/objects/objects/${encodeURIComponent(id)}`;

    return {
      create: async (input: unknown) =>
        wrap(
          (await this.request("POST", "/ontology/objects/objects", {
            body: { object_type_id: await objectTypeId(), properties: input },
          })) as WireObject
        ),
      delete: async (id: string) => {
        await this.request("DELETE", objectPath(id));
      },
      get: async (id: string) => wrap(await fetchOne(id)),
      list: async () => {
        const records = (await this.request(
          "GET",
          "/ontology/objects/objects",
          {
            query: { object_type_id: await objectTypeId() },
          }
        )) as WireObject[];
        return Promise.all(records.map(wrap));
      },
      put: async (id: string, input: unknown) =>
        wrap(
          (await this.request("PUT", objectPath(id), {
            body: { object_type_id: await objectTypeId(), properties: input },
          })) as WireObject
        ),
      update: async (id: string, patch: unknown) => {
        const current = await fetchOne(id);
        return wrap(
          (await this.request("PUT", objectPath(id), {
            body: {
              object_type_id: await objectTypeId(),
              properties: { ...current.properties, ...(patch as object) },
            },
          })) as WireObject
        );
      },
    };
  }

  /** Attaches one method per declared relation to a flattened read object. */
  #withRelations(
    runtime: RuntimeMeta,
    entity: string,
    read: Record<string, unknown>,
    source: WireObject
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...read };
    for (const [name, meta] of Object.entries(
      runtime.relations[entity] ?? {}
    )) {
      out[name] = () => this.#resolveRelation(runtime, meta, source);
    }
    return out;
  }

  async #resolveRelation(
    runtime: RuntimeMeta,
    meta: RelationMeta,
    source: WireObject
  ): Promise<unknown> {
    const single =
      meta.cardinality === "belongsTo" || meta.cardinality === "hasOne";
    if (meta.foreignKey !== undefined) {
      const key = source.properties[meta.foreignKey];
      if (typeof key !== "string") {
        return null;
      }
      return this.#getOrNull(runtime, meta.target, key);
    }
    const query: Record<string, string> = {
      source_object_id: source.object_id,
    };
    if (meta.relationshipTypeId !== undefined) {
      query.relationship_type_id = meta.relationshipTypeId;
    }
    const links = (await this.request(
      "GET",
      "/ontology/relationships/relationships",
      {
        query,
      }
    )) as WireRelationship[];
    const targets = await Promise.all(
      links.map((link) =>
        this.#getOrNull(runtime, meta.target, link.target_object_id)
      )
    );
    return single ? (targets[0] ?? null) : targets;
  }

  async #getOrNull(
    runtime: RuntimeMeta,
    entity: string,
    id: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const record = (await this.request(
        "GET",
        `/ontology/objects/objects/${encodeURIComponent(id)}`
      )) as WireObject;
      return this.#withRelations(runtime, entity, flatten(record), record);
    } catch (error) {
      if (error instanceof FrontalMockError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}

/**
 * The generated client's entry point. The runtime is passed in, so nothing is
 * read from the backend. The typed `O` comes from the generated `Ontology`.
 */
export function createFrontalClient<O>(
  config: SdkConfig,
  runtime: RuntimeMeta
): Frontal<O> {
  return new Frontal<O>(config, runtime);
}
