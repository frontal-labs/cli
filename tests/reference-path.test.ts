import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceFor } from "../src/lib/ontology/reference.js";

const ROOT = join("/tmp", "frontal-project");
const FRONTAL_DIR = join(ROOT, ".frontal");
const OUTSIDE_ROOT = /must be inside the project/;

describe("referenceFor", () => {
  it("accepts a path inside the project root", () => {
    const ref = referenceFor(
      join(ROOT, "src", "frontal-env.d.ts"),
      ROOT,
      FRONTAL_DIR
    );
    expect(ref.displayPath).toBe("src/frontal-env.d.ts");
  });

  it("rejects a path that climbs out of the project root", () => {
    expect(() =>
      referenceFor(
        join(ROOT, "..", "elsewhere", "evil.d.ts"),
        ROOT,
        FRONTAL_DIR
      )
    ).toThrow(OUTSIDE_ROOT);
  });

  it("rejects an absolute path outside the project root", () => {
    expect(() =>
      referenceFor(join("/tmp", "other", "evil.d.ts"), ROOT, FRONTAL_DIR)
    ).toThrow(OUTSIDE_ROOT);
  });
});
