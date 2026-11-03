import { type SpawnOptions, spawn, spawnSync } from "node:child_process";
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMockOntologyBackend,
  type MockObjectType,
  type MockOntologyBackend,
} from "./support/mock-ontology-backend.js";

/**
 * Runs the real `frontal` binary over HTTP against the mock backend. Nothing is
 * mocked inside the CLI: the base URL comes from FRONTAL_API_URL, the key from
 * FRONTAL_API_KEY, and every request crosses the loopback interface.
 *
 * Needs `bun` on PATH (the CLI runs from source). Skipped with a reason otherwise.
 */
const CLI_ENTRY = resolve(import.meta.dirname, "..", "bin", "frontal.ts");
const FIXTURE_FRONTAL = join(
  import.meta.dirname,
  "fixtures",
  "ontology-app",
  ".frontal"
);
const FIXTURE_TYPES = join(
  import.meta.dirname,
  "fixtures",
  "ontology-app",
  "object-types.json"
);
const BUN_AVAILABLE = spawnSync("bun", ["--version"]).status === 0;
const LIVE_TIMEOUT_MS = 120_000;

interface CliRun {
  exitCode: number;
  stderr: string;
  stdout: string;
}

let mock: MockOntologyBackend;
let home: string;

beforeAll(async () => {
  if (!BUN_AVAILABLE) {
    return;
  }
  const objectTypes = JSON.parse(
    readFileSync(FIXTURE_TYPES, "utf-8")
  ) as MockObjectType[];
  mock = createMockOntologyBackend({ objectTypes });
  await mock.start();
  home = mkdtempSync(join(tmpdir(), "frontal-live-home-"));
});

afterAll(async () => {
  if (mock) {
    await mock.stop();
  }
  if (home) {
    rmSync(home, { force: true, recursive: true });
  }
});

/** A project with the fixture's config and no generated files, as `frontal init` leaves it. */
function newProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "frontal-live-project-"));
  mkdirSync(join(dir, ".frontal"), { recursive: true });
  cpSync(
    join(FIXTURE_FRONTAL, "config.jsonc"),
    join(dir, ".frontal", "config.jsonc")
  );
  return dir;
}

/**
 * Runs `frontal <args>` in `cwd` against the mock. Asynchronous on purpose: the
 * mock server runs in this process, so a blocking spawn would starve it.
 * Only the variables below reach the child.
 */
function frontal(
  cwd: string,
  args: string[],
  token: string = mock.token
): Promise<CliRun> {
  const options: SpawnOptions = {
    cwd,
    env: {
      FRONTAL_API_KEY: token,
      FRONTAL_API_URL: mock.url,
      FRONTAL_CONFIG_DIR: join(home, "config"),
      HOME: home,
      NO_COLOR: "1",
      PATH: process.env.PATH ?? "",
    },
  };
  return new Promise((resolveRun, reject) => {
    const child = spawn("bun", [CLI_ENTRY, ...args], options);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), LIVE_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ exitCode: code ?? -1, stderr, stdout });
    });
  });
}

const frontalDir = (project: string): string => join(project, ".frontal");

describe.skipIf(!BUN_AVAILABLE)(
  "ontology sync over HTTP (mock backend)",
  () => {
    it(
      "writes the generated files, reports unchanged on a second run, and sends the key",
      async () => {
        const project = newProject();
        try {
          const first = await frontal(project, ["sync"]);
          expect(first.exitCode, first.stderr).toBe(0);
          for (const file of [
            "ontology.json",
            "ontology.d.ts",
            "client.ts",
            "version.json",
          ]) {
            expect(existsSync(join(frontalDir(project), file)), file).toBe(
              true
            );
          }
          expect(
            readFileSync(join(frontalDir(project), "client.ts"), "utf-8")
          ).toContain('Customer: "ot_customer"');

          const second = await frontal(project, ["sync"]);
          expect(second.exitCode, second.stderr).toBe(0);
          expect(second.stdout).toContain("already synchronised");

          const authorizedReads = mock
            .requests()
            .filter(
              (entry) => entry.path === "/v1/ontology/objects/object-types"
            );
          expect(authorizedReads.length).toBeGreaterThan(0);
          expect(authorizedReads.every((entry) => entry.authorized)).toBe(true);
        } finally {
          rmSync(project, { force: true, recursive: true });
        }
      },
      LIVE_TIMEOUT_MS
    );

    it(
      "regenerates after an ontology edit, and --check flags a hand-edited file",
      async () => {
        const project = newProject();
        const original = JSON.parse(
          readFileSync(FIXTURE_TYPES, "utf-8")
        ) as MockObjectType[];
        try {
          expect((await frontal(project, ["sync"])).exitCode).toBe(0);
          expect((await frontal(project, ["sync", "--check"])).exitCode).toBe(
            0
          );

          // Frontal Studio adds a required enum field to Customer.
          mock.setObjectTypes(
            original.map((type) =>
              type.name === "Customer"
                ? {
                    ...type,
                    schema: {
                      ...type.schema,
                      fields: {
                        ...(type.schema.fields as Record<string, unknown>),
                        tier: {
                          enum: ["gold", "basic"],
                          required: true,
                          type: "enum",
                        },
                      },
                    },
                  }
                : type
            )
          );

          const changed = await frontal(project, ["sync"]);
          expect(changed.exitCode, changed.stderr).toBe(0);
          expect(
            readFileSync(join(frontalDir(project), "ontology.d.ts"), "utf-8")
          ).toContain("tier: CustomerTier;");
          expect((await frontal(project, ["sync", "--check"])).exitCode).toBe(
            0
          );

          // A hand edit to a generated file must be detected by --check.
          const clientPath = join(frontalDir(project), "client.ts");
          writeFileSync(
            clientPath,
            `${readFileSync(clientPath, "utf-8")}// hand edit\n`
          );
          const stale = await frontal(project, ["sync", "--check"]);
          expect(stale.exitCode).not.toBe(0);
          expect(stale.stderr).toContain("ONTOLOGY_OUT_OF_DATE");
          expect(stale.stderr).toContain("client.ts (differs)");
        } finally {
          mock.setObjectTypes(original);
          rmSync(project, { force: true, recursive: true });
        }
      },
      LIVE_TIMEOUT_MS
    );

    it(
      "fails with an auth error and writes nothing when the key is rejected",
      async () => {
        const project = newProject();
        try {
          const result = await frontal(
            project,
            ["sync"],
            "frt_wrong_0123456789"
          );

          expect(result.exitCode).toBe(3);
          expect(result.stderr).toContain("ONTOLOGY_UNAUTHORIZED");
          expect(result.stderr).toContain("Frontal rejected the API key");
          expect(existsSync(join(frontalDir(project), "ontology.json"))).toBe(
            false
          );
          expect(existsSync(join(frontalDir(project), "client.ts"))).toBe(
            false
          );
        } finally {
          rmSync(project, { force: true, recursive: true });
        }
      },
      LIVE_TIMEOUT_MS
    );
  }
);
