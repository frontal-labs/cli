import { z } from "zod";
import { CONTRACT_VERSION, ONTOLOGY_FORMAT } from "@/lib/ontology/constants.js";

/**
 * Zod schemas for every external shape the ontology code reads: backend
 * object-type records and the committed `.frontal/` documents. Parsing happens
 * only here; the rest of the module works with the inferred types.
 *
 * The backend contract is docs/backend-spec/ontology-openapi.yaml. An object
 * type is `ObjectTypeResponse { object_type_id, name, schema }`, and the list
 * endpoint returns a bare array (it is not paged).
 *
 * ASSUMPTION: the spec types `schema` as a free-form object. The CLI reads the
 * entity definition (fields, relationships, version) from it, following the
 * ModelDefinition convention in packages/ontology/src/schemas.ts. Confirm
 * against a live backend.
 */

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

export const RELATION_TYPES = [
  "hasOne",
  "hasMany",
  "belongsTo",
  "manyToMany",
] as const;

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
    type: z.enum(RELATION_TYPES),
  })
  .loose();

/** The entity definition stored in an object type's `schema`. */
export const objectTypeDefinitionSchema = z
  .object({
    fields: z.record(z.string(), fieldSchema).default({}),
    relationships: z.record(z.string(), relationSchema).default({}),
    version: z.number().int().nonnegative().nullable().optional(),
  })
  .loose();

/** One object type as the backend returns it (`ObjectTypeResponse`). */
export const objectTypeRecordSchema = z
  .object({
    name: z.string().min(1),
    object_type_id: z.string().min(1),
    schema: objectTypeDefinitionSchema,
  })
  .loose();

export type RawObjectTypeRecord = z.infer<typeof objectTypeRecordSchema>;
export type RawObjectTypeDefinition = z.infer<
  typeof objectTypeDefinitionSchema
>;
export type RawField = z.infer<typeof fieldSchema>;
export type RawRelation = z.infer<typeof relationSchema>;
export type RawFieldType = (typeof FIELD_TYPES)[number];
export type RawRelationType = (typeof RELATION_TYPES)[number];

/** The object-type list response: a bare array of records (validated per record later). */
export const objectTypeListSchema = z.array(z.unknown());

const SHA256_HASH = /^sha256:[0-9a-f]{64}$/;

const SHA256_STRING = z.string().regex(SHA256_HASH, "expected sha256:<64 hex>");

/** Committed `ontology.json`. `objectTypes` is kept verbatim, key-sorted. */
export const documentSchema = z
  .object({
    format: z.literal(ONTOLOGY_FORMAT),
    objectTypes: z.array(z.record(z.string(), z.unknown())),
    schemaHash: SHA256_STRING,
    source: z.unknown().optional(),
  })
  .loose();

export type OntologyDocumentJson = z.infer<typeof documentSchema>;

/** Committed `version.json`. */
export const versionSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    entities: z.record(z.string(), z.number().int().nullable()),
    generatorVersion: z.string(),
    schemaHash: SHA256_STRING,
    sdkRange: z.string(),
  })
  .loose();

export type VersionJson = z.infer<typeof versionSchema>;
