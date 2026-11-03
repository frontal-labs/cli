import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATOR_VERSION } from "@/lib/ontology/constants.js";
import { syncOntology } from "@/lib/ontology/sync.js";
import { objectType } from "./support/object-types.js";

/**
 * End-to-end: a consumer project compiled against the real SDK source.
 *
 * The SDK is resolved from FRONTAL_SDK_SOURCE (a path to packages/sdk/src/index.ts)
 * or, by default, the sibling checkout ../sdk-typescript. The suite is skipped
 * with a message when that source is absent.
 */
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
/** `packages/` of the SDK monorepo, used to map `@frontal-labs/ontology` to source as well. */
const SDK_PACKAGES = resolve(SDK_SOURCE, "..", "..", "..");
const SDK_ROOT = resolve(SDK_PACKAGES, "..");
const SDK_AVAILABLE = existsSync(SDK_SOURCE);
const TSC = join(import.meta.dirname, "..", "node_modules", ".bin", "tsc");
const FIXTURE = join(import.meta.dirname, "fixtures", "ontology-app");
const COMPILE_TIMEOUT_MS = 240_000;
/** A real directive: a line whose first token is `// @ts-expect-error`. Prose mentions do not count. */
const DIRECTIVE = /^\s*\/\/ @ts-expect-error/;

interface Compiled {
  output: string;
  status: number;
}

/** Writes a tsconfig that maps the SDK packages to this checkout, then runs tsc. */
function compile(projectDir: string): Compiled {
  const tsconfig = join(projectDir, "tsconfig.e2e.json");
  writeFileSync(
    tsconfig,
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          noEmit: true,
          paths: {
            "@frontal-labs/core": [
              join(SDK_PACKAGES, "core", "src", "index.ts"),
            ],
            "@frontal-labs/ontology": [
              join(SDK_PACKAGES, "ontology", "src", "index.ts"),
            ],
            "@frontal-labs/sdk": [SDK_SOURCE],
          },
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
          // The SDK sources reference Node globals (Error.captureStackTrace, Buffer).
          typeRoots: [join(SDK_ROOT, "node_modules", "@types")],
          types: ["node"],
        },
        include: ["src/**/*.ts", ".frontal/**/*.ts"],
      },
      null,
      2
    )
  );
  const result = spawnSync(TSC, ["-p", tsconfig], { encoding: "utf-8" });
  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status ?? -1,
  };
}

/** Copies the fixture's generated files and sources into a fresh project directory. */
function copyFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "frontal-e2e-"));
  cpSync(join(FIXTURE, ".frontal"), join(dir, ".frontal"), { recursive: true });
  cpSync(join(FIXTURE, "src"), join(dir, "src"), { recursive: true });
  return dir;
}

/** Writes an app file under `src/`, creating the directory if needed. */
function writeApp(dir: string, name: string, source: string): void {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", name), source);
}

describe.skipIf(!SDK_AVAILABLE)(
  SDK_AVAILABLE
    ? `ontology consumer fixture (SDK at ${SDK_SOURCE})`
    : `ontology consumer fixture (skipped: no SDK source at ${SDK_SOURCE}; set FRONTAL_SDK_SOURCE)`,
  () => {
    it(
      "compiles the typed client, and every negative case fails for the intended reason",
      () => {
        const dir = copyFixture();
        try {
          const positive = compile(dir);
          expect(positive.output).toBe("");
          expect(positive.status).toBe(0);

          // Strip every directive: each negative line must now produce a type error.
          const negatives = readFileSync(
            join(dir, "src", "negatives.ts"),
            "utf-8"
          );
          const directives = negatives
            .split("\n")
            .filter((line) => DIRECTIVE.test(line)).length;
          writeApp(
            dir,
            "negatives.ts",
            negatives
              .split("\n")
              .filter((line) => !DIRECTIVE.test(line))
              .join("\n")
          );
          const probe = compile(dir);
          const errors = probe.output
            .split("\n")
            .filter((line) => line.includes("error TS"));
          expect(directives).toBeGreaterThan(0);
          expect(errors).toHaveLength(directives);
        } finally {
          rmSync(dir, { force: true, recursive: true });
        }
      },
      COMPILE_TIMEOUT_MS
    );

    it(
      "picks up an ontology change: removed fields fail, new required fields are enforced",
      async () => {
        const dir = mkdtempSync(join(tmpdir(), "frontal-e2e-change-"));
        try {
          const frontalDir = join(dir, ".frontal");
          mkdirSync(frontalDir, { recursive: true });

          const v1 = [
            objectType("Customer", {
              fields: {
                email: { required: true, type: "string" },
                legacyCode: { type: "string" },
              },
              version: 1,
            }),
          ];
          await syncOntology(
            { frontalDir, generatorVersion: GENERATOR_VERSION },
            () => Promise.resolve(v1)
          );
          writeApp(
            dir,
            "app.ts",
            [
              'import { createFrontal } from "../.frontal/client";',
              'const frontal = createFrontal({ apiKey: "test" });',
              "export async function run(): Promise<void> {",
              '  const c = await frontal.ontology.Customer.get("1");',
              "  console.log(c.email, c.legacyCode);",
              '  await frontal.ontology.Customer.create({ email: "a" });',
              "}",
            ].join("\n")
          );
          const before = compile(dir);
          expect(before.status, before.output).toBe(0);

          // Ontology changes in Frontal Studio: legacyCode removed, tier added as required.
          const v2 = [
            objectType("Customer", {
              fields: {
                email: { required: true, type: "string" },
                tier: { enum: ["gold", "basic"], required: true, type: "enum" },
              },
              version: 2,
            }),
          ];
          await syncOntology(
            { frontalDir, generatorVersion: GENERATOR_VERSION },
            () => Promise.resolve(v2)
          );

          const after = compile(dir);
          expect(after.status).not.toBe(0);
          expect(after.output).toContain("legacyCode");
          expect(after.output).toContain("tier");

          // Updating the app to the new ontology compiles again.
          writeApp(
            dir,
            "app.ts",
            [
              'import { createFrontal } from "../.frontal/client";',
              'const frontal = createFrontal({ apiKey: "test" });',
              "export async function run(): Promise<void> {",
              '  const c = await frontal.ontology.Customer.get("1");',
              '  const tier: "gold" | "basic" = c.tier;',
              '  await frontal.ontology.Customer.create({ email: "a", tier: "gold" });',
              "  console.log(tier);",
              "}",
            ].join("\n")
          );
          const updated = compile(dir);
          expect(updated.status, updated.output).toBe(0);
        } finally {
          rmSync(dir, { force: true, recursive: true });
        }
      },
      COMPILE_TIMEOUT_MS
    );
  }
);
