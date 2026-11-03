import { z } from "zod";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";

/** Field types accepted from the backend (mirrors FieldTypeSchema in @frontal-labs/ontology). */
export const FIELD_TYPES = [
  "string",
  "integer",
  "float",
  "boolean",
  "uuid",
  "timestamp",
  "currency",
  "json",
  "array",
  "enum",
  "vector",
  "text",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * Names on `OntologySdk` (`@frontal-labs/ontology`). An entity with one of
 * these names would collide with the SDK's own namespaces, so it is rejected.
 * Keep in sync with the SDK when namespaces are added.
 */
export const RESERVED_ONTOLOGY_NAMES: readonly string[] = [
  "engine",
  "objects",
  "relationships",
  "schemas",
  "versions",
  "validation",
  "transformations",
  "reasoning",
  "rollouts",
  "rollups",
  "extract",
  "events",
];

// ASSUMPTION: object-type records follow ModelDefinitionSchema
// (packages/ontology/src/schemas.ts). The backend response schema is untyped.
const fieldSchema = z
  .object({
    auto: z.boolean().optional(),
    computed: z.boolean().optional(),
    default: z.unknown().optional(),
    enum: z.array(z.string()).optional(),
    items: z.string().optional(),
    primary: z.boolean().default(false),
    required: z.boolean().default(false),
    type: z.enum(FIELD_TYPES),
  })
  .loose();

const relationSchema = z
  .object({
    foreignKey: z.string().min(1).optional(),
    targetEntity: z.string().min(1),
    type: z.enum(["hasOne", "hasMany", "belongsTo", "manyToMany"]),
  })
  .loose();

const objectTypeSchema = z
  .object({
    fields: z.record(z.string(), fieldSchema).default({}),
    name: z.string().min(1),
    relationships: z.record(z.string(), relationSchema).optional(),
    version: z.number().int().nonnegative().nullable().optional(),
  })
  .loose();

export interface NormalizedField {
  /** Enum values in declaration order (only for `enum` fields). */
  enumValues?: string[];
  /** Has a backend default, so a create may omit it. */
  hasDefault: boolean;
  /** Element type name for `array` fields. */
  items?: string;
  name: string;
  /** Writable by clients: not primary, auto or computed. */
  readOnly: boolean;
  required: boolean;
  type: FieldType;
}

export interface NormalizedRelation {
  /** Foreign key on the source record (declared or `<name>Id`). */
  foreignKey: string;
  name: string;
  /** False when the foreign key is required on the source record. */
  optional: boolean;
  target: string;
}

export interface NormalizedEntity {
  fields: NormalizedField[];
  name: string;
  relations: NormalizedRelation[];
  /** Backend `version` of the object type, or null when absent. */
  version: number | null;
}

export interface NormalizedOntology {
  entities: NormalizedEntity[];
  /** Non-fatal notes, e.g. relations the generator does not support yet. */
  warnings: string[];
}

type ParsedField = z.infer<typeof fieldSchema>;
type ParsedRelation = z.infer<typeof relationSchema>;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const NON_ALNUM = /[^A-Za-z0-9]+/;
const LEADING_DIGIT = /^[0-9]/;
/** The backend's object id is always exposed as `id`, so a field named `id` is not a separate property. */
const OBJECT_ID_FIELD = "id";

export function invalidOntology(message: string): CliError {
  return new CliError("ONTOLOGY_INVALID", message, {
    exitCode: EXIT_CODES.VALIDATION_ERROR,
    fix: "Check the object type in Frontal Studio, then run `frontal sync` again.",
  });
}

/** Converts an entity or field name into a PascalCase fragment safe for a type name. */
export function pascalCase(name: string): string {
  const joined = name
    .split(NON_ALNUM)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return LEADING_DIGIT.test(joined) || joined === "" ? `T${joined}` : joined;
}

/** Quotes a property name unless it is a plain identifier. */
export function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

function compareNames(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function normalizeEnumValues(
  entity: string,
  field: string,
  values: string[] | undefined
): string[] {
  if (!values || values.length === 0) {
    throw invalidOntology(
      `Field "${entity}.${field}" is an enum without values.`
    );
  }
  if (new Set(values).size !== values.length) {
    throw invalidOntology(
      `Field "${entity}.${field}" has duplicate enum values.`
    );
  }
  return values;
}

function assertUniqueNames(
  kind: string,
  names: readonly string[],
  fix: string
): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw invalidOntology(
        `${kind} "${name}" is defined more than once. ${fix}`
      );
    }
    seen.add(name);
  }
}

function parseObjectTypes(rawObjectTypes: unknown[]) {
  return rawObjectTypes.map((raw, index) => {
    const result = objectTypeSchema.safeParse(raw);
    if (!result.success) {
      const [issue] = result.error.issues;
      const where = issue?.path.length ? issue.path.join(".") : "record";
      throw invalidOntology(
        `Object type #${index + 1} is malformed (${where}: ${issue?.message ?? "invalid"}).`
      );
    }
    return result.data;
  });
}

/** Rejects duplicate names, PascalCase type-name clashes and SDK-reserved names. */
function assertEntityNames(names: string[]): void {
  assertUniqueNames("Entity", names, "Object type names must be unique.");
  const aliases = new Map<string, string>();
  for (const name of names) {
    const alias = pascalCase(name);
    const clash = aliases.get(alias);
    if (clash !== undefined) {
      throw invalidOntology(
        `Entities "${clash}" and "${name}" both map to the type name "${alias}". Rename one of them.`
      );
    }
    aliases.set(alias, name);
    if (RESERVED_ONTOLOGY_NAMES.includes(name)) {
      throw invalidOntology(
        `Entity "${name}" collides with the SDK namespace ontology.${name}. Rename the entity.`
      );
    }
  }
}

/** Reduces declared fields to normalized fields, skipping the object id field. */
function normalizeFields(
  entity: string,
  declared: Record<string, ParsedField>,
  enumAliases: Map<string, string>
): NormalizedField[] {
  const fields: NormalizedField[] = [];
  for (const [fieldName, field] of Object.entries(declared)) {
    if (fieldName === OBJECT_ID_FIELD) {
      continue;
    }
    const normalized: NormalizedField = {
      hasDefault: field.default !== undefined,
      name: fieldName,
      readOnly: Boolean(field.primary || field.auto || field.computed),
      required: field.required,
      type: field.type,
    };
    if (field.type === "enum") {
      normalized.enumValues = normalizeEnumValues(
        entity,
        fieldName,
        field.enum
      );
      registerEnumAlias(entity, fieldName, enumAliases);
    }
    if (field.type === "array" && field.items !== undefined) {
      normalized.items = field.items;
    }
    fields.push(normalized);
  }
  return fields;
}

function registerEnumAlias(
  entity: string,
  field: string,
  enumAliases: Map<string, string>
): void {
  const alias = `${pascalCase(entity)}${pascalCase(field)}`;
  const owner = `${entity}.${field}`;
  const clash = enumAliases.get(alias);
  if (clash !== undefined && clash !== owner) {
    throw invalidOntology(
      `Enums "${clash}" and "${owner}" both map to the type name "${alias}". Rename one of them.`
    );
  }
  enumAliases.set(alias, owner);
}

/**
 * Normalizes relations. Supported kinds become accessors; hasMany and
 * manyToMany are skipped with a warning. Undeclared foreign keys are added as
 * optional writable fields (ASSUMPTION: stored on the source record).
 */
function normalizeRelations(
  entity: string,
  declared: Record<string, ParsedRelation>,
  fields: NormalizedField[],
  targets: Set<string>,
  warnings: string[]
): NormalizedRelation[] {
  const relations: NormalizedRelation[] = [];
  for (const [relName, relation] of Object.entries(declared).sort(([a], [b]) =>
    compareNames(a, b)
  )) {
    if (relation.type === "hasMany" || relation.type === "manyToMany") {
      warnings.push(
        `Skipped ${entity}.${relName} (${relation.type}): no backend query exists yet.`
      );
      continue;
    }
    if (!targets.has(relation.targetEntity)) {
      throw invalidOntology(
        `Relation "${entity}.${relName}" targets unknown entity "${relation.targetEntity}".`
      );
    }
    const foreignKey = relation.foreignKey ?? `${relName}Id`;
    const fkField = ensureField(fields, foreignKey);
    relations.push({
      foreignKey,
      name: relName,
      optional: !fkField.required,
      target: relation.targetEntity,
    });
  }
  return relations;
}

/** Returns the named field, adding an optional writable uuid when it is undeclared. */
function ensureField(fields: NormalizedField[], name: string): NormalizedField {
  const existing = fields.find((field) => field.name === name);
  if (existing) {
    return existing;
  }
  const added: NormalizedField = {
    hasDefault: false,
    name,
    readOnly: false,
    required: false,
    type: "uuid",
  };
  fields.push(added);
  return added;
}

/**
 * Validates raw object-type records and reduces them to the shape the type
 * generator needs. Entities are sorted by name; fields and relations are
 * sorted by name too, so output does not depend on backend ordering.
 */
export function normalizeOntology(
  rawObjectTypes: unknown[]
): NormalizedOntology {
  const warnings: string[] = [];
  const parsed = parseObjectTypes(rawObjectTypes);
  const names = parsed.map((type) => type.name).sort(compareNames);
  assertEntityNames(names);

  const byName = new Map(parsed.map((type) => [type.name, type]));
  const targets = new Set(names);
  const enumAliases = new Map<string, string>();
  const entities: NormalizedEntity[] = names.map((name) => {
    const type = byName.get(name);
    if (!type) {
      throw invalidOntology(`Entity "${name}" is missing.`);
    }
    const fields = normalizeFields(name, type.fields, enumAliases);
    const relations = normalizeRelations(
      name,
      type.relationships ?? {},
      fields,
      targets,
      warnings
    );
    fields.sort((a, b) => compareNames(a.name, b.name));
    relations.sort((a, b) => compareNames(a.name, b.name));
    return { fields, name, relations, version: type.version ?? null };
  });

  return { entities, warnings };
}
