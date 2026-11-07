import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type BunRun, runBun } from "./support/bun-run.js";
import {
  createMockOntologyBackend,
  type MockObjectType,
  type MockOntologyBackend,
} from "./support/mock-ontology-backend.js";
import { SDK_PACKAGES, SDK_SOURCE } from "./support/sdk-source.js";

/**
 * Runs the generated client's object flow (create, get, relation, update, list,
 * delete) under bun, against the mock backend over real HTTP.
 *
 * The SDK is resolved from the installed `@frontal-labs/*` packages (see
 * ./support/sdk-source.ts). Core and ontology are mapped to the same packages
 * root, so the run uses one consistent SDK. Skipped with a reason when bun or
 * that source is missing.
 */
const FIXTURE = join(import.meta.dirname, "fixtures", "ontology-app");
const FLOW_SOURCE = join(import.meta.dirname, "support", "sdk-object-flow.ts");
const BUN_AVAILABLE = spawnSync("bun", ["--version"]).status === 0;
const SDK_AVAILABLE = existsSync(SDK_SOURCE);
const RUN_TIMEOUT_MS = 120_000;

let mock: MockOntologyBackend;
let scratch: string;

beforeAll(async () => {
  if (!(BUN_AVAILABLE && SDK_AVAILABLE)) {
    return;
  }
  const objectTypes = JSON.parse(
    readFileSync(join(FIXTURE, "object-types.json"), "utf-8")
  ) as MockObjectType[];
  mock = createMockOntologyBackend({ objectTypes });
  await mock.start();
  scratch = mkdtempSync(join(tmpdir(), "frontal-sdk-flow-"));
});

afterAll(async () => {
  if (mock) {
    await mock.stop();
  }
  if (scratch) {
    rmSync(scratch, { force: true, recursive: true });
  }
});

/** Writes a consumer project: the generated `.frontal/`, the flow as `main.ts`, and a tsconfig that maps the SDK. */
function consumerProject(): string {
  const dir = join(scratch, "app");
  mkdirSync(dir, { recursive: true });
  copyFileSync(FLOW_SOURCE, join(dir, "main.ts"));
  cpSync(join(FIXTURE, ".frontal"), join(dir, ".frontal"), { recursive: true });
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          module: "ESNext",
          moduleResolution: "bundler",
          paths: {
            "@frontal-labs/core": [
              join(SDK_PACKAGES, "core", "src", "index.ts"),
            ],
            "@frontal-labs/ontology": [
              join(SDK_PACKAGES, "ontology", "src", "index.ts"),
            ],
            "@frontal-labs/sdk": [SDK_SOURCE],
          },
          target: "ES2022",
        },
      },
      null,
      2
    )
  );
  return dir;
}

type RunResult = BunRun;

/** Runs `bun main.ts` in `cwd` against the mock (see runBun for the start-up retry). */
function runFlow(cwd: string): Promise<RunResult> {
  return runBun(["main.ts"], {
    cwd,
    env: {
      FRONTAL_API_KEY: mock.token,
      FRONTAL_API_URL: mock.url,
      HOME: scratch,
      NO_COLOR: "1",
      PATH: process.env.PATH ?? "",
    },
    timeoutMs: RUN_TIMEOUT_MS,
  });
}

describe.skipIf(!(BUN_AVAILABLE && SDK_AVAILABLE))(
  `SDK object flow over HTTP (mock backend, SDK at ${SDK_SOURCE})`,
  () => {
    it(
      "creates, reads, follows a relation, updates, lists and deletes through the generated client",
      async () => {
        const project = consumerProject();
        const run = await runFlow(project);

        expect(run.exitCode, run.stderr).toBe(0);
        const observed = JSON.parse(
          run.stdout.trim().split("\n").pop() ?? "{}"
        ) as Record<string, unknown>;
        expect(observed).toMatchObject({
          companyName: "Acme",
          customerEmail: "flow@example.com",
          deletedIsGone: true,
          parentName: "Acme",
          updatedScore: 5,
        });
        expect(observed.listedCustomerIds).toContain("c-flow-1");
      },
      RUN_TIMEOUT_MS
    );

    it(
      "stores each object under the object type id the generated client declares",
      () => {
        // Company survives the run (only the Customer is deleted), so its record
        // shows which object type id the client wrote with.
        const companies = mock
          .objects()
          .filter((object) => object.object_type_id === "ot_company");
        expect(companies.length).toBeGreaterThan(0);
        expect(companies[0]?.properties).toMatchObject({ name: "Acme" });
        expect(
          mock
            .requests()
            .every((entry) => entry.method !== "PUT" || entry.authorized)
        ).toBe(true);
        // The generated client carries the object types (pinned mode), so the
        // run never asks the backend for them.
        const metadataReads = mock
          .requests()
          .filter(
            (entry) =>
              entry.method === "GET" &&
              entry.path.endsWith("/ontology/objects/object-types")
          );
        expect(metadataReads).toHaveLength(0);
      },
      RUN_TIMEOUT_MS
    );
  }
);
