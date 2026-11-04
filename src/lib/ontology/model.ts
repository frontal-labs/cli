/**
 * The validated, translator-ready ontology. Produced only by `normalize.ts`;
 * the renderers consume it and never see raw backend records.
 */

/** Scalar fields. Each maps to exactly one TypeScript type. */
export type ScalarFieldType =
  | "string"
  | "text"
  | "uuid"
  | "timestamp"
  | "integer"
  | "float"
  | "currency"
  | "boolean"
  | "json"
  | "vector";

/** Element types an `array` field may declare. */
export type ArrayItemType =
  | "string"
  | "text"
  | "uuid"
  | "timestamp"
  | "integer"
  | "float"
  | "currency"
  | "boolean";

export type FieldKind =
  | { kind: "scalar"; type: ScalarFieldType }
  | { kind: "enum"; typeName: string; values: readonly string[] }
  | { kind: "array"; item: ArrayItemType | undefined };

export interface NormalizedField {
  /** Has a backend default, so a create may omit it. */
  hasDefault: boolean;
  kind: FieldKind;
  name: string;
  /** Not writable by clients: primary, auto or computed. */
  readOnly: boolean;
  required: boolean;
}

/** A relation the generator can translate. Every kind produces an accessor. */
export type NormalizedRelation =
  | {
      /** Foreign key on the source record (declared, or `<name>Id`). */
      foreignKey: string;
      kind: "belongsTo";
      name: string;
      /** True when the foreign key is not required on the source record. */
      optional: boolean;
      target: string;
    }
  | {
      kind: "hasOne" | "hasMany" | "manyToMany";
      name: string;
      /** True only for `hasOne`: zero related objects resolve to `null`. */
      optional: boolean;
      /** Backend relationship type that the source's relationship instances carry. */
      relationshipTypeId: string;
      target: string;
    };

export interface NormalizedEntity {
  fields: NormalizedField[];
  name: string;
  /** Backend id of the object type; the object endpoints address records by it. */
  objectTypeId: string;
  relations: NormalizedRelation[];
  /** Backend `version` of the object type, or null when absent. */
  version: number | null;
}

export interface NormalizedOntology {
  entities: NormalizedEntity[];
  /** Non-fatal notes for the author. Empty today: every relation kind is translated. */
  warnings: string[];
}
