/**
 * Builders for raw backend object-type records, shaped as the backend returns
 * them: `{ object_type_id, name, schema }`, where `schema` holds the entity
 * definition (fields, relationships, version). See docs/backend-spec.
 */

export interface DefinitionInput {
  fields?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  version?: number | null;
}

/** Stable id for a test object type: `ot_` plus the name in snake case. */
export function idFor(name: string): string {
  return `ot_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

/** One raw object-type record. The id defaults to `idFor(name)`. */
export function objectType(
  name: string,
  definition: DefinitionInput = {},
  objectTypeId: string = idFor(name)
): Record<string, unknown> {
  return { name, object_type_id: objectTypeId, schema: { ...definition } };
}
