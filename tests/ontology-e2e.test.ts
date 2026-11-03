import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(import.meta.dirname, "fixtures", "ontology-app");
const TSC = join(import.meta.dirname, "..", "node_modules", ".bin", "tsc");
/** The SDK source the fixture maps `@frontal-labs/sdk` to (see its tsconfig). */
const SDK_SOURCE = join(
  APP_DIR,
  "..",
  "..",
  "..",
  "..",
  "sdk-typescript",
  "packages",
  "sdk",
  "src",
  "index.ts"
);

const sdkAvailable = existsSync(SDK_SOURCE);

describe("ontology consumer fixture", () => {
  it.skipIf(!sdkAvailable)(
    "compiles the typed client and every negative case fails as intended",
    () => {
      // Throws (non-zero exit) on any type error, including an unused
      // @ts-expect-error directive, so a clean run proves both directions.
      const output = execFileSync(TSC, ["-p", join(APP_DIR, "tsconfig.json")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(output).toBe("");
    },
    120_000
  );
});
