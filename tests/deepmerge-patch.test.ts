import deepmerge from "deepmerge";
import { expect, it } from "vitest";

it("does not copy __proto__ keys from a merge source onto the result", () => {
  const source = JSON.parse('{"__proto__":{"polluted":"yes"},"ok":1}');

  const merged = deepmerge(Object.create(null), source) as Record<
    string,
    unknown
  >;

  expect(merged.polluted).toBeUndefined();
  expect(merged.ok).toBe(1);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

it("still merges nested objects normally", () => {
  expect(deepmerge({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({
    a: { b: 1, c: 2 },
  });
});
