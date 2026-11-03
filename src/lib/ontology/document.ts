import { createHash } from "node:crypto";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { normalizeOntology } from "@/lib/ontology/model.js";

export const ONTOLOGY_FORMAT = "frontal.ontology/v1";
export const ONTOLOGY_SOURCE = {
  endpoint: "/v1/ontology/objects/object-types",
  service: "ontology/objects",
} as const;

export interface OntologyDocumentData {
  objectTypes: Record<string, unknown>[];
  schemaHash: string;
}

/** Recursively sorts object keys so equal values serialise identically. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical (key-sorted, compact) JSON used for hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function hashOf(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function compareNames(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/**
 * Builds the committed `ontology.json` data from raw backend object types.
 * Validates first (throws on malformed input), keeps records verbatim, and
 * sorts them by name so the hash is order-independent.
 */
export function buildDocument(rawObjectTypes: unknown[]): OntologyDocumentData {
  normalizeOntology(rawObjectTypes);
  const objectTypes = rawObjectTypes
    .map((raw) => sortKeysDeep(raw) as Record<string, unknown>)
    .sort((a, b) => compareNames(String(a.name), String(b.name)));
  return { objectTypes, schemaHash: hashOf(objectTypes) };
}

/** Pretty JSON with sorted keys and a trailing newline. No timestamps. */
export function renderDocument(data: OntologyDocumentData): string {
  return `${JSON.stringify(
    sortKeysDeep({
      format: ONTOLOGY_FORMAT,
      objectTypes: data.objectTypes,
      schemaHash: data.schemaHash,
      source: ONTOLOGY_SOURCE,
    }),
    null,
    2
  )}\n`;
}

/**
 * Parses a committed `ontology.json`. Checks the format tag and the stored
 * hash against the recomputed hash of `objectTypes`.
 */
export function parseDocument(text: string): OntologyDocumentData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw corruptDocument(`is not valid JSON (${String(err)})`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { format?: unknown }).format !== ONTOLOGY_FORMAT
  ) {
    throw corruptDocument(
      `has an unknown format (expected ${ONTOLOGY_FORMAT})`
    );
  }
  const { objectTypes, schemaHash } = parsed as {
    objectTypes?: unknown;
    schemaHash?: unknown;
  };
  if (!Array.isArray(objectTypes) || typeof schemaHash !== "string") {
    throw corruptDocument("is missing objectTypes or schemaHash");
  }
  const recomputed = hashOf(objectTypes);
  if (recomputed !== schemaHash) {
    throw corruptDocument(
      "does not match its schemaHash (edited by hand? run `frontal sync`)"
    );
  }
  return {
    objectTypes: objectTypes as Record<string, unknown>[],
    schemaHash,
  };
}

function corruptDocument(reason: string): CliError {
  return new CliError("ONTOLOGY_CORRUPT", `.frontal/ontology.json ${reason}.`, {
    exitCode: EXIT_CODES.VALIDATION_ERROR,
    fix: "Run `frontal sync` to regenerate it from Frontal.",
  });
}
