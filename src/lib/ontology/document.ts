import {
  documentSchema,
  type OntologyDocumentJson,
} from "@/lib/ontology/backend.js";
import {
  OBJECT_TYPES_SOURCE,
  ONTOLOGY_FORMAT,
} from "@/lib/ontology/constants.js";
import { corruptFile } from "@/lib/ontology/errors.js";
import { compareStrings, hashOf, sortKeysDeep } from "@/lib/ontology/hash.js";

/** The committed snapshot: raw object types plus the hash that identifies them. */
export interface OntologyDocument {
  objectTypes: Record<string, unknown>[];
  schemaHash: string;
}

/**
 * Builds the document from raw backend records. The caller must validate them
 * first (see `snapshotOf`). Records are kept verbatim (key-sorted) and ordered
 * by name, so the hash does not depend on backend ordering.
 */
export function buildDocument(
  rawObjectTypes: readonly unknown[]
): OntologyDocument {
  const objectTypes = rawObjectTypes
    .map((raw) => sortKeysDeep(raw) as Record<string, unknown>)
    .sort((a, b) => compareStrings(String(a.name), String(b.name)));
  return { objectTypes, schemaHash: hashOf(objectTypes) };
}

/** Pretty JSON with sorted keys and a trailing newline. No timestamps. */
export function renderDocument(document: OntologyDocument): string {
  const body: OntologyDocumentJson = {
    format: ONTOLOGY_FORMAT,
    objectTypes: document.objectTypes,
    schemaHash: document.schemaHash,
    source: OBJECT_TYPES_SOURCE,
  };
  return `${JSON.stringify(sortKeysDeep(body), null, 2)}\n`;
}

/**
 * Parses a committed `ontology.json`. Checks the format tag, the shape, and
 * that the stored hash matches the recomputed hash of `objectTypes`, so a
 * hand-edited snapshot is detected.
 */
export function parseDocument(text: string): OntologyDocument {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw corruptFile("ontology.json", "is not valid JSON", err);
  }
  const parsed = documentSchema.safeParse(json);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const where =
      issue && issue.path.length > 0
        ? issue.path.map(String).join(".")
        : "document";
    throw corruptFile(
      "ontology.json",
      `is malformed at ${where}: ${issue?.message ?? "invalid"}`
    );
  }
  const recomputed = hashOf(parsed.data.objectTypes);
  if (recomputed !== parsed.data.schemaHash) {
    throw corruptFile(
      "ontology.json",
      "does not match its schemaHash (edited by hand? run `frontal sync`)"
    );
  }
  return {
    objectTypes: parsed.data.objectTypes,
    schemaHash: parsed.data.schemaHash,
  };
}
