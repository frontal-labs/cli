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
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastJson, mockApi, runCli } from "./helpers/cli.js";
import { objectType } from "./support/object-types.js";

// Generated headers carry the generator version; pin it so fixtures stay stable.
vi.mock("@/version.js", () => ({ VERSION: "0.1.2" }));

const FIXTURE = join(import.meta.dirname, "fixtures", "ontology-app");
const OBJECT_TYPES = JSON.parse(
  readFileSync(join(FIXTURE, "object-types.json"), "utf-8")
) as unknown[];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-sync-cli-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
  vi.restoreAllMocks();
});

/** A project with the fixture config and committed generated files. */
function committedProject(): void {
  cpSync(join(FIXTURE, ".frontal"), join(root, ".frontal"), {
    recursive: true,
  });
  // The reference file lives in src/ when the project has one (the default).
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(
    join(FIXTURE, "src", "frontal-env.d.ts"),
    join(root, "src", "frontal-env.d.ts")
  );
}

/** A project with only the fixture config, as `frontal init` leaves it. */
function configOnlyProject(): void {
  mkdirSync(join(root, ".frontal"), { recursive: true });
  cpSync(
    join(FIXTURE, ".frontal", "config.jsonc"),
    join(root, ".frontal", "config.jsonc")
  );
}

/** The object-type list is an unpaged array (docs/backend-spec). */
function objectTypesRoute(data: unknown[] = OBJECT_TYPES) {
  return {
    body: data,
    method: "GET",
    path: "/ontology/objects/object-types",
  };
}

describe("frontal sync --check (offline)", () => {
  it("exits 0 with no credentials when committed files match", async () => {
    committedProject();

    const result = await runCli(["sync", "--check"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain(
      "generated files match ontology sha256:"
    );
  });

  it("exits 2 and lists the stale file with its reason", async () => {
    committedProject();
    writeFileSync(join(root, ".frontal", "client.ts"), "// drifted\n");

    const result = await runCli(["sync", "--check"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("client.ts (differs)");
  });

  it("emits a machine-readable report with --json, including the failure case", async () => {
    committedProject();
    rmSync(join(root, ".frontal", "version.json"));

    const result = await runCli(["sync", "--check", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(lastJson(result.stdout)).toMatchObject({
      ok: false,
      stale: [{ file: "version.json", reason: "missing" }],
    });
  });

  it("exits 2 when ontology.json is missing", async () => {
    configOnlyProject();

    const result = await runCli(["sync", "--check"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("ontology.json not found");
    expect(existsSync(join(root, ".frontal", "ontology.json"))).toBe(false);
  });
});

describe("frontal sync", () => {
  it("fails with an auth error when no credentials are configured", async () => {
    committedProject();

    const result = await runCli(["sync"]);

    expect(result.exitCode).toBe(3);
  });

  it("fails with a project error outside a Frontal project", async () => {
    const result = await runCli(["sync"]);

    expect(result.exitCode).toBe(6);
  });

  it("reports each file's outcome, warnings and next steps on first sync", async () => {
    configOnlyProject();
    await mockApi([objectTypesRoute()]);

    const result = await runCli(["sync"]);
    const text = result.stdout.join("\n");

    expect(result.exitCode).toBe(0);
    expect(text).toContain("created   .frontal/ontology.d.ts");
    expect(text).toContain("created   .frontal/ontology.json");
    expect(text).not.toContain("Skipped ");
    expect(text).toContain("Next:");
  });

  it("writes the same bytes as the committed fixture", async () => {
    configOnlyProject();
    await mockApi([objectTypesRoute()]);

    await runCli(["sync"]);

    for (const file of [
      "ontology.d.ts",
      "client.ts",
      "version.json",
      "ontology.json",
    ]) {
      expect(readFileSync(join(root, ".frontal", file), "utf-8")).toBe(
        readFileSync(join(FIXTURE, ".frontal", file), "utf-8")
      );
    }
  });

  it("says the local types are already synchronised on a second run", async () => {
    configOnlyProject();
    await mockApi([objectTypesRoute()]);
    await runCli(["sync"]);

    const second = await runCli(["sync", "--json"]);

    expect(lastJson(second.stdout)).toMatchObject({ changed: false });
    const human = await runCli(["sync"]);
    expect(human.stdout.join("\n")).toContain("already synchronised");
  });

  it("fails with a clear error naming the malformed object type, and writes nothing", async () => {
    configOnlyProject();
    await mockApi([
      objectTypesRoute([
        objectType("Customer", { fields: { email: { type: "bogus" } } }),
      ]),
    ]);

    const result = await runCli(["sync"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("ONTOLOGY_INVALID");
    expect(result.stderr.join("\n")).toContain(
      'Object type #1 ("Customer") is malformed'
    );
    expect(existsSync(join(root, ".frontal", "ontology.json"))).toBe(false);
  });
});

describe("frontal status", () => {
  it("reports OUTDATED before the first sync, then UP TO DATE after it", async () => {
    configOnlyProject();
    await mockApi([objectTypesRoute()]);

    const before = await runCli(["status", "--json"]);
    expect(before.exitCode).toBe(0);
    expect(lastJson(before.stdout)).toMatchObject({
      local: { state: "missing" },
      status: "OUTDATED",
    });

    await runCli(["sync"]);

    const after = await runCli(["status", "--json"]);
    expect(lastJson(after.stdout)).toMatchObject({ status: "UP TO DATE" });
  });

  it("prints the sync hint when outdated", async () => {
    configOnlyProject();
    await mockApi([objectTypesRoute()]);

    const result = await runCli(["status"]);

    const text = result.stdout.join("\n");
    expect(text).toContain("Frontal Project: ontology-app");
    expect(text).toContain("Status: OUTDATED");
    expect(text).toContain("Run frontal sync to update generated types.");
  });
});

describe("frontal sync: reference file", () => {
  it("reports the reference file as missing in --check", async () => {
    committedProject();
    rmSync(join(root, "src", "frontal-env.d.ts"));

    const result = await runCli(["sync", "--check", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(lastJson(result.stdout)).toMatchObject({
      stale: [{ file: "src/frontal-env.d.ts", reason: "missing" }],
    });
  });

  it("writes the reference file into src/ when the project has one", async () => {
    configOnlyProject();
    mkdirSync(join(root, "src"), { recursive: true });
    await mockApi([objectTypesRoute()]);

    const result = await runCli(["sync"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain(
      "created   src/frontal-env.d.ts"
    );
    expect(readFileSync(join(root, "src", "frontal-env.d.ts"), "utf-8")).toBe(
      readFileSync(join(FIXTURE, "src", "frontal-env.d.ts"), "utf-8")
    );
  });

  it("writes to --types-out when given", async () => {
    configOnlyProject();
    await mockApi([objectTypesRoute()]);

    const result = await runCli([
      "sync",
      "--types-out",
      "types/frontal-env.d.ts",
    ]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, "types", "frontal-env.d.ts"))).toBe(true);
  });

  it("refuses to overwrite a file frontal did not generate, and writes nothing", async () => {
    configOnlyProject();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "frontal-env.d.ts"), "// hand written\n");
    await mockApi([objectTypesRoute()]);

    const result = await runCli(["sync"]);

    expect(result.exitCode).toBe(6);
    expect(result.stderr.join("\n")).toContain("ONTOLOGY_REFERENCE_NOT_OWNED");
    expect(readFileSync(join(root, "src", "frontal-env.d.ts"), "utf-8")).toBe(
      "// hand written\n"
    );
    expect(existsSync(join(root, ".frontal", "ontology.json"))).toBe(false);
  });
});
