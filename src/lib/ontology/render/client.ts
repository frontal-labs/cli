import type {
  NormalizedEntity,
  NormalizedField,
  NormalizedOntology,
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

function relationEntries(entity: NormalizedEntity): [string, string][] {
  return entity.relations.map((relation): [string, string] => [
    propertyKey(relation.name),
    `{ target: ${JSON.stringify(relation.target)}, foreignKey: ${JSON.stringify(relation.foreignKey)}, optional: ${relation.optional} }`,
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
    renderRuntimeConst(model),
    "",
    "export function createFrontal(config: SdkConfig) {",
    "  return createFrontalClient<Ontology>(config, runtime);",
    "}",
    "",
  ].join("\n");
}
