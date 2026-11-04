import { isJsonRecord, type JsonRecord } from "@/lib/json.js";

const REDACTED = "[REDACTED]";

// Frontal API keys (`frt_…`) — keep the prefix so users can tell which
// credential type was present without leaking the secret itself.
const API_KEY_PATTERN = /\bfrt_[A-Za-z0-9_-]{4,}/g;
// Bearer tokens in header-style strings.
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
// JWTs: three base64url segments separated by dots.
const JWT_PATTERN =
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

const SENSITIVE_KEY_PATTERN =
  /(^|_|\b)(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization|token)($|_|\b)/i;

let extraSensitiveKeys: Set<string> = new Set();

/**
 * Registers additional key names (e.g. from `.frontal/config.jsonc` `secrets.required`)
 * whose values must always be masked.
 */
export function registerSensitiveKeys(keys: Iterable<string>): void {
  extraSensitiveKeys = new Set([...extraSensitiveKeys, ...keys]);
}

/** Splits camelCase so `clientSecret` tests as `client_secret`. */
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;

/** True for values that can carry a credential: strings and nested objects. */
function isSecretValue(value: unknown): boolean {
  return (
    typeof value === "string" || (typeof value === "object" && value !== null)
  );
}

export function isSensitiveKey(key: string): boolean {
  if (extraSensitiveKeys.has(key)) {
    return true;
  }
  return SENSITIVE_KEY_PATTERN.test(key.replace(CAMEL_BOUNDARY, "$1_$2"));
}

export function redactString(value: string): string {
  return value
    .replace(API_KEY_PATTERN, "frt_[REDACTED]")
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED);
}

/**
 * Deep-redacts secrets from any value: masks sensitive object keys and
 * strips key/token patterns from strings. Safe for JSON, YAML and human
 * output.
 */
export function redact(value: unknown): unknown {
  return redactValue(value, new WeakSet());
}

/**
 * Redacts a JSON object and keeps its record type. Redaction only rewrites
 * leaf values, so the result is always a record; the guard makes that
 * invariant checked instead of asserted.
 */
export function redactRecord(value: JsonRecord): JsonRecord {
  const out = redactValue(value, new WeakSet());
  if (!isJsonRecord(out)) {
    throw new TypeError("redaction changed the shape of a record");
  }
  return out;
}

/** Redacts a list of JSON objects, keeping each element a record. */
export function redactRecords(values: readonly JsonRecord[]): JsonRecord[] {
  const out = redactValue(values, new WeakSet());
  if (!(Array.isArray(out) && out.every(isJsonRecord))) {
    throw new TypeError("redaction changed the shape of a record list");
  }
  return out;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }
  if (value instanceof Error) {
    const redactedFields = redactValue({ ...value }, seen);
    const extra = isJsonRecord(redactedFields) ? redactedFields : {};
    return {
      ...extra,
      message: redactString(value.message),
      name: value.name,
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // Only secret values are masked. A boolean or number under a sensitive-
    // looking name (for example `hasApiKey: true`) is a flag, not a credential.
    if (isSensitiveKey(key) && isSecretValue(item)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(item, seen);
    }
  }
  return out;
}
