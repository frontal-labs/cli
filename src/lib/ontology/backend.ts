import { z } from "zod";
import { CONTRACT_VERSION, ONTOLOGY_FORMAT } from "@/lib/ontology/constants.js";

/**
 * Zod schemas for every external shape the ontology code reads: backend
 * object types and pages, and the committed `.frontal/` documents. Parsing
 * happens only here; the rest of the module works with the inferred types.
 *
 * ASSUMPTION: object-type records follow ModelDefinitionSchema in
 * packages/ontology/src/schemas.ts. The backend's OpenAPI response is untyped.
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

export const objectTypeSchema = z
  .object({
    fields: z.record(z.string(), fieldSchema).default({}),
    name: z.string().min(1),
    relationships: z.record(z.string(), relationSchema).default({}),
    version: z.number().int().nonnegative().nullable().optional(),
  })
  .loose();

export type RawObjectType = z.infer<typeof objectTypeSchema>;
export type RawField = z.infer<typeof fieldSchema>;
export type RawRelation = z.infer<typeof relationSchema>;
export type RawFieldType = (typeof FIELD_TYPES)[number];
export type RawRelationType = (typeof RELATION_TYPES)[number];

/** Envelope of one page of the object-type list. */
export const pageEnvelopeSchema = z
  .object({
    data: z.array(z.unknown()),
    pagination: z.object({ hasMore: z.boolean() }).loose(),
  })
  .loose();

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
