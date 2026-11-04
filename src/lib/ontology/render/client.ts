import type {
  NormalizedEntity,
  NormalizedField,
  NormalizedOntology,
  NormalizedRelation,
  ScalarFieldType,
} from "@/lib/ontology/model.js";
import { propertyKey } from "@/lib/ontology/names.js";
import { type RenderMeta, renderHeader } from "@/lib/ontology/render/header.js";
import {
  renderObjectLiteral,
  renderStringArray,
} from "@/lib/ontology/render/members.js";

/**
 * Runtime value kind of each scalar, as the SDK checks it. Timestamps and
 * identifiers are strings; `json` and `vector` are not checked.
 */
/** The object id every entity exposes; it is always a required string. */
const OBJECT_ID_KEY = "id";

const RUNTIME_SCALAR: Record<ScalarFieldType, string> = {
  boolean: '"boolean"',
  currency: '"number"',
  float: '"number"',
  integer: '"number"',
  json: '"unknown"',
  string: '"string"',
  text: '"string"',
  timestamp: '"string"',
  uuid: '"string"',
  vector: '"unknown"',
};

function assertNever(value: never): never {
  throw new Error(`Unhandled field kind: ${String(value)}`);
}

/** Runtime kind of a field value: a scalar name, `{ enum }`, or `"unknown"` for arrays. */
function runtimeKindOf(field: NormalizedField): string {
  const { kind } = field;
  switch (kind.kind) {
    case "scalar":
      return RUNTIME_SCALAR[kind.type];
    case "enum":
      return `{ enum: ${renderStringArray(kind.values)} }`;
    case "array":
      return '"unknown"';
    default:
      return assertNever(kind);
  }
}

/**
 * Every read field of an entity, including the object id: its runtime kind and
 * whether it is required on read. Id comes first, then fields by name.
 */
function readFieldEntries(entity: NormalizedEntity): [string, string][] {
  const idEntry: [string, string] = [
    OBJECT_ID_KEY,
    `{ kind: "string", required: true }`,
  ];
  const fieldEntries = entity.fields.map((field): [string, string] => [
    propertyKey(field.name),
    `{ kind: ${runtimeKindOf(field)}, required: ${field.required} }`,
  ]);
  return [idEntry, ...fieldEntries];
}

/** Field names a client may write: everything except primary, auto and computed fields. */
function writableNames(entity: NormalizedEntity): string[] {
  return entity.fields
    .filter((field) => !field.readOnly)
    .map((field) => field.name);
}

/**
 * One relation's runtime metadata. `belongsTo` reads a foreign key from the
 * source record; the other kinds resolve through relationship instances of the
 * declared relationship type (contract v2, section 5).
 */
function relationLiteral(relation: NormalizedRelation): string {
  const target = JSON.stringify(relation.target);
  switch (relation.kind) {
    case "belongsTo":
      return `{ cardinality: "belongsTo", target: ${target}, foreignKey: ${JSON.stringify(relation.foreignKey)}, optional: ${relation.optional} }`;
    case "hasOne":
    case "hasMany":
    case "manyToMany":
      return `{ cardinality: "${relation.kind}", target: ${target}, relationshipTypeId: ${JSON.stringify(relation.relationshipTypeId)} }`;
    default:
      return assertNever(relation);
  }
}

function relationEntries(entity: NormalizedEntity): [string, string][] {
  return entity.relations.map((relation): [string, string] => [
    propertyKey(relation.name),
    relationLiteral(relation),
  ]);
}

/**
 * Renders the `runtime` literal. Every entity appears under every section,
 * even when its entry is empty, so lookups never need a fallback.
 */
export function renderRuntimeConst(model: NormalizedOntology): string {
  const entityNames = model.entities.map((entity) =>
    JSON.stringify(entity.name)
  );
  const objectTypeIds = model.entities.map((entity): [string, string] => [
    propertyKey(entity.name),
    JSON.stringify(entity.objectTypeId),
  ]);
  const fields = model.entities.map((entity): [string, string] => [
    propertyKey(entity.name),
    renderObjectLiteral(readFieldEntries(entity), "    "),
  ]);
  const writable = model.entities.map((entity): [string, string] => [
    propertyKey(entity.name),
    renderStringArray(writableNames(entity)),
  ]);
  const relations = model.entities.map((entity): [string, string] => [
    propertyKey(entity.name),
    renderObjectLiteral(relationEntries(entity), "    "),
  ]);

  return [
    "const runtime = {",
    `  entities: [${entityNames.join(", ")}],`,
    `  objectTypeIds: ${renderObjectLiteral(objectTypeIds, "  ")},`,
    `  fields: ${renderObjectLiteral(fields, "  ")},`,
    `  writable: ${renderObjectLiteral(writable, "  ")},`,
    `  relations: ${renderObjectLiteral(relations, "  ")},`,
    "} as const;",
  ].join("\n");
}

/** Renders `client.ts`, the typed factory. The only place this template lives. */
export function renderClientModule(
  model: NormalizedOntology,
  meta: RenderMeta
): string {
  return [
    renderHeader(meta),
    'import { createFrontalClient, type SdkConfig } from "@frontal-labs/sdk";',
    'import type { Ontology } from "./ontology";',
    "",
    "// Optional pinned mode: offline, or when the runtime metadata must not be",
    "// fetched at start-up. Direct use needs no generated code beyond the",
    "// reference file: `new Frontal({ apiKey })` from @frontal-labs/sdk is typed.",
    renderRuntimeConst(model),
    "",
    "export function createFrontal(config: SdkConfig) {",
    "  return createFrontalClient<Ontology>(config, runtime);",
    "}",
    "",
  ].join("\n");
}
