/**
 * Object-literal and object-type rendering helpers shared by the renderers.
 * Keeping indentation and empty-object handling here means every generated
 * file lays out nested structures the same way.
 */

/** One property of a generated object type. */
export interface Member {
  key: string;
  optional: boolean;
  type: string;
}

/** Renders `{ key?: type; ... }`, or `emptyType` when there are no members. */
export function renderMemberType(
  members: readonly Member[],
  indent: string,
  emptyType: string
): string {
  if (members.length === 0) {
    return emptyType;
  }
  const lines = members.map(
    (member) =>
      `${indent}  ${member.key}${member.optional ? "?" : ""}: ${member.type};`
  );
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** Renders a JavaScript object literal with one entry per line, or `{}` when empty. */
export function renderObjectLiteral(
  entries: readonly [key: string, value: string][],
  indent: string
): string {
  if (entries.length === 0) {
    return "{}";
  }
  const lines = entries.map(([key, value]) => `${indent}  ${key}: ${value},`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** Renders a single-line array of string literals, e.g. `["a", "b"]`. */
export function renderStringArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}
