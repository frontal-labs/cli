import {
  objectTypeRecordSchema,
  type RawField,
  type RawObjectTypeRecord,
  type RawRelation,
} from "@/lib/ontology/backend.js";
import {
  RESERVED_ENTITY_NAMES,
  RESERVED_MEMBER_NAMES,
} from "@/lib/ontology/constants.js";
import { invalidOntology } from "@/lib/ontology/errors.js";
import { compareStrings } from "@/lib/ontology/hash.js";
import type {
  ArrayItemType,
  FieldKind,
  NormalizedEntity,
  NormalizedField,
  NormalizedOntology,
  NormalizedRelation,
  ScalarFieldType,
} from "@/lib/ontology/model.js";
import { enumTypeName, isUnsafeKey, pascalCase } from "@/lib/ontology/names.js";

/** Field name the backend's object id occupies; it is not a separate property. */
const OBJECT_ID_FIELD = "id";

const ARRAY_ITEM_TYPES: readonly ArrayItemType[] = [
  "string",
  "text",
  "uuid",
  "timestamp",
  "integer",
  "float",
  "currency",
  "boolean",
];

/** Relation kinds the generator does not translate yet, and why. */
const SKIPPED_RELATION_REASON = {
  hasMany: "no backend query exists yet",
  hasOne: "the backend has no target-side query yet",
  manyToMany: "no backend query exists yet",
} as const;

function assertNever(value: never): never {
  throw new Error(`Unhandled ontology case: ${String(value)}`);
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => compareStrings(a, b));
}

/**
 * Parses one raw object-type record, naming the object type and the failing
 * path (for example `schema.fields.name.type`) in the error.
 */
function parseObjectType(raw: unknown, index: number): RawObjectTypeRecord {
  const result = objectTypeRecordSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const [issue] = result.error.issues;
  const named =
    typeof raw === "object" &&
    raw !== null &&
    "name" in raw &&
    typeof raw.name === "string"
      ? ` ("${raw.name}")`
      : "";
  const where =
    issue && issue.path.length > 0
      ? issue.path.map(String).join(".")
      : "record";
  throw invalidOntology(
    `Object type #${index + 1}${named} is malformed at ${where}: ${issue?.message ?? "invalid value"}.`
  );
}

function assertEntityNames(names: readonly string[]): void {
  const aliases = new Map<string, string>();
  for (const [index, name] of names.entries()) {
    if (names.indexOf(name) !== index) {
      throw invalidOntology(
        `Entity "${name}" is defined more than once. Object type names must be unique.`
      );
    }
    if (isUnsafeKey(name)) {
      throw invalidOntology(
        `Entity "${name}" is a reserved JavaScript property name. Rename the entity.`
      );
    }
    if (RESERVED_ENTITY_NAMES.includes(name)) {
      throw invalidOntology(
        `Entity "${name}" collides with the SDK namespace ontology.${name}. Rename the entity.`
      );
    }
    const alias = pascalCase(name);
    const clash = aliases.get(alias);
    if (clash !== undefined) {
      throw invalidOntology(
        `Entities "${clash}" and "${name}" both map to the type name "${alias}". Rename one of them.`
      );
    }
    aliases.set(alias, name);
  }
}

/** Object-type ids name the backend records, so each must appear once. */
function assertObjectTypeIds(records: readonly RawObjectTypeRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.object_type_id)) {
      throw invalidOntology(
        `Object type id "${record.object_type_id}" (${record.name}) is returned more than once.`
      );
    }
    seen.add(record.object_type_id);
  }
}

/** Rejects a field or relation name that cannot be a property of the generated record. */
function assertMemberName(
  entity: string,
  name: string,
  role: "field" | "relation"
): void {
  if (isUnsafeKey(name)) {
    throw invalidOntology(
      `${capitalize(role)} "${entity}.${name}" is a reserved JavaScript property name. Rename it.`
    );
  }
  if (RESERVED_MEMBER_NAMES.includes(name)) {
    throw invalidOntology(
      `${capitalize(role)} "${entity}.${name}" uses the reserved member name "${name}". Rename it.`
    );
  }
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function enumValuesOf(
  entity: string,
  field: string,
  values: readonly string[] | undefined
): string[] {
  if (values === undefined || values.length === 0) {
    throw invalidOntology(
      `Field "${entity}.${field}" is an enum without values.`
    );
  }
  if (new Set(values).size !== values.length) {
    throw invalidOntology(
      `Field "${entity}.${field}" has duplicate enum values.`
    );
  }
  return [...values];
}

function arrayItemOf(
  entity: string,
  field: string,
  items: string | undefined
): ArrayItemType | undefined {
  if (items === undefined) {
    return undefined;
  }
  const match = ARRAY_ITEM_TYPES.find((item) => item === items);
  if (match === undefined) {
    throw invalidOntology(
      `Field "${entity}.${field}" has unsupported array item type "${items}".`
    );
  }
  return match;
}

/**
 * Maps a backend field type to the generator's kind. Each raw type is listed
 * explicitly, so a new backend type fails to compile here until it is handled.
 */
function fieldKindOf(
  entity: string,
  name: string,
  raw: RawField,
  enumOwners: Map<string, string>
): FieldKind {
  switch (raw.type) {
    case "enum": {
      const typeName = enumTypeName(entity, name);
      const owner = `${entity}.${name}`;
      const clash = enumOwners.get(typeName);
      if (clash !== undefined && clash !== owner) {
        throw invalidOntology(
          `Enums "${clash}" and "${owner}" both map to the type name "${typeName}". Rename one of them.`
        );
      }
      enumOwners.set(typeName, owner);
      return {
        kind: "enum",
        typeName,
        values: enumValuesOf(entity, name, raw.enum),
      };
    }
    case "array":
      return { item: arrayItemOf(entity, name, raw.items), kind: "array" };
    case "string":
    case "text":
    case "uuid":
    case "timestamp":
    case "integer":
    case "float":
    case "currency":
    case "boolean":
    case "json":
    case "vector":
      return { kind: "scalar", type: raw.type satisfies ScalarFieldType };
    default:
      return assertNever(raw.type);
  }
}

function normalizeFields(
  entity: string,
  declared: Record<string, RawField>,
  enumOwners: Map<string, string>
): NormalizedField[] {
  const fields: NormalizedField[] = [];
  for (const [name, raw] of sortedEntries(declared)) {
    if (name === OBJECT_ID_FIELD) {
      continue;
    }
    assertMemberName(entity, name, "field");
    fields.push({
      hasDefault: raw.default !== undefined,
      kind: fieldKindOf(entity, name, raw, enumOwners),
      name,
      readOnly: raw.primary || raw.auto === true || raw.computed === true,
      required: raw.required,
    });
  }
  return fields;
}

/** Returns the named field, adding an optional writable uuid when the backend does not declare it. */
function ensureField(fields: NormalizedField[], name: string): NormalizedField {
  const existing = fields.find((field) => field.name === name);
  if (existing) {
    return existing;
  }
  const added: NormalizedField = {
    hasDefault: false,
    kind: { kind: "scalar", type: "uuid" },
    name,
    readOnly: false,
    required: false,
  };
  fields.push(added);
  return added;
}

/**
 * Normalizes one entity's relations. Each relation is checked against the
 * entity's fields so a relation can never shadow a stored value. Unsupported
 * kinds are reported as warnings and dropped.
 */
function normalizeRelations(
  entity: string,
  declared: Record<string, RawRelation>,
  fields: NormalizedField[],
  targets: ReadonlySet<string>,
  warnings: string[]
): NormalizedRelation[] {
  const relations: NormalizedRelation[] = [];
  for (const [name, relation] of sortedEntries(declared)) {
    assertMemberName(entity, name, "relation");
    if (!targets.has(relation.targetEntity)) {
      throw invalidOntology(
        `Relation "${entity}.${name}" targets unknown entity "${relation.targetEntity}".`
      );
    }
    switch (relation.type) {
      case "belongsTo": {
        const foreignKey = relation.foreignKey ?? `${name}Id`;
        assertMemberName(entity, foreignKey, "field");
        const field = ensureField(fields, foreignKey);
        relations.push({
          foreignKey,
          kind: "belongsTo",
          name,
          optional: !field.required,
          target: relation.targetEntity,
        });
        break;
      }
      case "hasOne":
      case "hasMany":
      case "manyToMany":
        warnings.push(
          `Skipped ${entity}.${name} (${relation.type}): ${SKIPPED_RELATION_REASON[relation.type]}.`
        );
        break;
      default:
        return assertNever(relation.type);
    }
  }
  return relations;
}

/** Rejects a field and a relation that share a name, since both live on one record. */
function assertDistinctMembers(
  entity: string,
  fields: readonly NormalizedField[],
  relations: readonly NormalizedRelation[]
): void {
  const fieldNames = new Set(fields.map((field) => field.name));
  for (const relation of relations) {
    if (fieldNames.has(relation.name)) {
      throw invalidOntology(
        `Relation "${entity}.${relation.name}" has the same name as a field. Rename one of them.`
      );
    }
  }
}

/**
 * Validates raw object-type records and reduces them to the model the
 * renderers use. The entity name and object-type id come from the record; the
 * fields, relationships and version come from its `schema`. Entities, fields
 * and relations are sorted by name, so the output does not depend on the order
 * the backend returned them in. Throws `ONTOLOGY_INVALID` (and never writes
 * anything) on the first rule violation.
 */
export function normalizeOntology(
  rawObjectTypes: readonly unknown[]
): NormalizedOntology {
  const records = rawObjectTypes.map((raw, index) =>
    parseObjectType(raw, index)
  );
  const names = records.map((record) => record.name);
  assertEntityNames(names);
  assertObjectTypeIds(records);

  const targets = new Set(names);
  const enumOwners = new Map<string, string>();
  const warnings: string[] = [];
  const entities: NormalizedEntity[] = records
    .sort((a, b) => compareStrings(a.name, b.name))
    .map((record) => {
      const definition = record.schema;
      const fields = normalizeFields(
        record.name,
        definition.fields,
        enumOwners
      );
      const relations = normalizeRelations(
        record.name,
        definition.relationships,
        fields,
        targets,
        warnings
      );
      assertDistinctMembers(record.name, fields, relations);
      fields.sort((a, b) => compareStrings(a.name, b.name));
      relations.sort((a, b) => compareStrings(a.name, b.name));
      return {
        fields,
        name: record.name,
        objectTypeId: record.object_type_id,
        relations,
        version: definition.version ?? null,
      };
    });

  return { entities, warnings };
}
