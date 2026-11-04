/** A JSON object whose members are not known statically. */
export type JsonRecord = Record<string, unknown>;

/** True for a non-null, non-array object: the only shape a JSON object takes. */
export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one member of an untyped JSON object. The result is `unknown`, so the
 * caller must narrow it before use. The key is a parameter, not a literal, so
 * the compiler does not require bracket access.
 */
export function jsonField(record: JsonRecord, key: string): unknown {
  return record[key];
}

/** The member as a string, or `undefined` when it is absent or not a string. */
export function jsonString(
  record: JsonRecord,
  key: string
): string | undefined {
  const value = jsonField(record, key);
  return typeof value === "string" ? value : undefined;
}

/** The member as an object, or `undefined` when it is absent or not an object. */
export function jsonObject(
  record: JsonRecord,
  key: string
): JsonRecord | undefined {
  const value = jsonField(record, key);
  return isJsonRecord(value) ? value : undefined;
}

/** Writes one member of an untyped JSON object. */
export function setJsonField(
  record: JsonRecord,
  key: string,
  value: unknown
): void {
  record[key] = value;
}

/** True when the member is truthy. Used for flags read from parsed options. */
export function jsonFlag(record: JsonRecord, key: string): boolean {
  return Boolean(jsonField(record, key));
}

/** The member as a number, or `undefined` when it is absent or not a number. */
export function jsonNumber(
  record: JsonRecord,
  key: string
): number | undefined {
  const value = jsonField(record, key);
  return typeof value === "number" ? value : undefined;
}

/** The member as an array of unknown elements, or `undefined` when not an array. */
export function jsonArray(
  record: JsonRecord,
  key: string
): unknown[] | undefined {
  const value = jsonField(record, key);
  return Array.isArray(value) ? value : undefined;
}

/** The string elements of an array member; other elements are dropped. */
export function jsonStringArray(record: JsonRecord, key: string): string[] {
  return (jsonArray(record, key) ?? []).filter(
    (item): item is string => typeof item === "string"
  );
}

/** The object elements of an array member; other elements are dropped. */
export function jsonRecordArray(record: JsonRecord, key: string): JsonRecord[] {
  return (jsonArray(record, key) ?? []).filter(isJsonRecord);
}
