/**
 * Name rules shared by the normaliser and the renderers. Every name that
 * becomes a TypeScript identifier or an object key goes through here.
 */

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const NON_ALNUM = /[^A-Za-z0-9]+/;
const LEADING_DIGIT = /^[0-9]/;

/**
 * Names that must not be used as object keys in generated runtime metadata:
 * JavaScript object internals, and `__proto__`, which an object literal would
 * treat as the prototype rather than as a key.
 */
const UNSAFE_KEYS: ReadonlySet<string> = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  "__proto__",
]);

/** True when `name` cannot safely be a key of generated runtime metadata. */
export function isUnsafeKey(name: string): boolean {
  return UNSAFE_KEYS.has(name);
}

/** Converts a name into a PascalCase fragment that is safe inside a type name. */
export function pascalCase(name: string): string {
  const joined = name
    .split(NON_ALNUM)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return LEADING_DIGIT.test(joined) || joined === "" ? `T${joined}` : joined;
}

/** Name of the enum type generated for `entity.field`. */
export function enumTypeName(entity: string, field: string): string {
  return `${pascalCase(entity)}${pascalCase(field)}`;
}

/** Renders a property key: bare when it is an identifier, quoted otherwise. */
export function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}
