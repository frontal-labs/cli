import type {
  ArrayItemType,
  NormalizedEntity,
  NormalizedField,
  NormalizedOntology,
  ScalarFieldType,
} from "@/lib/ontology/model.js";
import { propertyKey } from "@/lib/ontology/names.js";
import { type RenderMeta, renderHeader } from "@/lib/ontology/render/header.js";
import {
  type Member,
  renderMemberType,
} from "@/lib/ontology/render/members.js";

/** TypeScript type of each scalar field. Timestamps are ISO strings on the wire. */
const SCALAR_TYPE: Record<ScalarFieldType, string> = {
  boolean: "boolean",
  currency: "number",
  float: "number",
  integer: "number",
  json: "unknown",
  string: "string",
  text: "string",
  timestamp: "string",
  uuid: "string",
  vector: "number[]",
};

const ARRAY_ITEM_TYPE: Record<ArrayItemType, string> = {
  boolean: "boolean",
  currency: "number",
  float: "number",
  integer: "number",
  string: "string",
  text: "string",
  timestamp: "string",
  uuid: "string",
};

function assertNever(value: never): never {
  throw new Error(`Unhandled field kind: ${String(value)}`);
}

/** The non-null TypeScript type of a field's value. */
export function valueTypeOf(field: NormalizedField): string {
  const { kind } = field;
  switch (kind.kind) {
    case "scalar":
      return SCALAR_TYPE[kind.type];
    case "enum":
      return kind.typeName;
    case "array":
      return `${kind.item === undefined ? "unknown" : ARRAY_ITEM_TYPE[kind.item]}[]`;
    default:
      return assertNever(kind);
  }
}

/** Read shape: required fields are always present; optional ones may be null or absent. */
function readMember(field: NormalizedField): Member {
  const base = valueTypeOf(field);
  const key = propertyKey(field.name);
  return field.required
    ? { key, optional: false, type: base }
    : { key, optional: true, type: `${base} | null` };
}

/**
 * Create shape: required fields without a default must be supplied; anything
 * else may be omitted. Read-only fields (primary, auto, computed) are excluded.
 */
function createMember(field: NormalizedField): Member | undefined {
  if (field.readOnly) {
    return undefined;
  }
  const base = valueTypeOf(field);
  const key = propertyKey(field.name);
  if (field.required) {
    return { key, optional: field.hasDefault, type: base };
  }
  return { key, optional: true, type: `${base} | null` };
}

/** Update shape: a partial patch. Required fields stay non-null even when patched. */
function updateMember(field: NormalizedField): Member | undefined {
  if (field.readOnly) {
    return undefined;
  }
  const base = valueTypeOf(field);
  const key = propertyKey(field.name);
  return {
    key,
    optional: true,
    type: field.required ? base : `${base} | null`,
  };
}

function relationMembers(entity: NormalizedEntity): Member[] {
  return entity.relations.map((relation) => ({
    key: propertyKey(relation.name),
    optional: false,
    type: `{ target: ${JSON.stringify(relation.target)}; optional: ${relation.optional} }`,
  }));
}

function renderEntity(entity: NormalizedEntity): string {
  const indent = "    ";
  const read: Member[] = [
    { key: "id", optional: false, type: "string" },
    ...entity.fields.map(readMember),
  ];
  const create = entity.fields
    .map(createMember)
    .filter((member): member is Member => member !== undefined);
  const update = entity.fields
    .map(updateMember)
    .filter((member): member is Member => member !== undefined);
  return [
    `  ${propertyKey(entity.name)}: {`,
    `${indent}read: ${renderMemberType(read, indent, "Record<string, never>")};`,
    `${indent}create: ${renderMemberType(create, indent, "Record<string, never>")};`,
    `${indent}update: ${renderMemberType(update, indent, "Record<string, never>")};`,
    // `Record<never, never>` (not `{}`) so keyof yields no relation names.
    `${indent}relations: ${renderMemberType(relationMembers(entity), indent, "Record<never, never>")};`,
    "  };",
  ].join("\n");
}

function renderEnumTypes(model: NormalizedOntology): string[] {
  const declarations: string[] = [];
  for (const entity of model.entities) {
    for (const field of entity.fields) {
      const { kind } = field;
      if (kind.kind === "enum") {
        const literals = kind.values
          .map((value) => JSON.stringify(value))
          .join(" | ");
        declarations.push(`export type ${kind.typeName} = ${literals};`);
      }
    }
  }
  return declarations;
}

/** Renders `ontology.d.ts`: enum types, then the `Ontology` interface. Deterministic. */
export function renderOntologyTypes(
  model: NormalizedOntology,
  meta: RenderMeta
): string {
  const lines = [renderHeader(meta), ""];
  const enums = renderEnumTypes(model);
  if (enums.length > 0) {
    lines.push(...enums, "");
  }
  if (model.entities.length === 0) {
    lines.push("export type Ontology = Record<never, never>;");
  } else {
    lines.push("export interface Ontology {");
    for (const entity of model.entities) {
      lines.push(renderEntity(entity));
    }
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}
