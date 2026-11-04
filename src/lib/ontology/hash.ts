import { createHash } from "node:crypto";

/** True for a plain JSON-style object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Recursively sorts object keys, so equal values serialise to equal bytes. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareStrings)) {
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

/** Compact JSON with sorted keys. This is the byte string that gets hashed. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** `sha256:<hex>` over the canonical JSON of `value`. */
export function hashOf(value: unknown): string {
  const digest = createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
  return `sha256:${digest}`;
}

/** Code-unit ordering. Locale-independent, so output is identical on every machine. */
export function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
