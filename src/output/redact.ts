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
 * Registers additional key names (e.g. from `frontal.jsonc` `secrets.required`)
 * whose values must always be masked.
 */
export function registerSensitiveKeys(keys: Iterable<string>): void {
  extraSensitiveKeys = new Set([...extraSensitiveKeys, ...keys]);
}

export function isSensitiveKey(key: string): boolean {
  return extraSensitiveKeys.has(key) || SENSITIVE_KEY_PATTERN.test(key);
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
export function redact<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
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
    const extra = redactValue({ ...value }, seen) as Record<string, unknown>;
    return {
      ...extra,
      message: redactString(value.message),
      name: value.name,
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key) && item !== undefined && item !== null) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(item, seen);
    }
  }
  return out;
}
