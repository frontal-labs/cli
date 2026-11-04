import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The SDK derives runtime metadata from the live object types (used when no
 * runtime argument is given). The CLI generates the same metadata into
 * `.frontal/client.ts` (the pinned mode). Both must agree for the same input.
 */
const FIXTURE = join(import.meta.dirname, "fixtures", "ontology-app");
const SDK_SOURCE = resolve(
  process.env.FRONTAL_SDK_SOURCE ??
    join(
      import.meta.dirname,
      "..",
      "..",
      "sdk-typescript",
      "packages",
      "sdk",
      "src",
      "index.ts"
    )
);
const DERIVE_SOURCE = resolve(
  SDK_SOURCE,
  "..",
  "..",
  "..",
  "ontology",
  "src",
  "entity-derive.ts"
);
const SDK_AVAILABLE = existsSync(DERIVE_SOURCE);

/** Evaluates the `const runtime = {...} as const;` literal from the generated client. */
const RUNTIME_LITERAL = /const runtime = (\{[\s\S]*?\n\}) as const;/;

function generatedRuntime(): unknown {
  const source = readFileSync(join(FIXTURE, ".frontal", "client.ts"), "utf-8");
  const match = RUNTIME_LITERAL.exec(source);
  if (!match?.[1]) {
    throw new Error("runtime literal not found in .frontal/client.ts");
  }
  // The literal is generated, plain data; evaluating it is the only way to compare values.
  return new Function(`return (${match[1]});`)();
}

describe.skipIf(!SDK_AVAILABLE)(
  `runtime metadata parity: SDK derivation equals generated client (SDK at ${DERIVE_SOURCE})`,
  () => {
    it("derives the same runtime metadata as the CLI generator for the fixture", async () => {
      const derive = (await import(pathToFileURL(DERIVE_SOURCE).href)) as {
        deriveOntologyRuntime: (response: unknown) => unknown;
      };
      const objectTypes = JSON.parse(
        readFileSync(join(FIXTURE, "object-types.json"), "utf-8")
      ) as unknown[];
      expect(derive.deriveOntologyRuntime(objectTypes)).toEqual(
        generatedRuntime()
      );
    });
  }
);
