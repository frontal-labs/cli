import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastJson, mockApi, runCli } from "./helpers/cli.js";

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

/** A project whose committed .frontal/ matches the fixture ontology. */
function committedProject(): void {
  cpSync(join(FIXTURE, ".frontal"), join(root, ".frontal"), {
    recursive: true,
  });
}

const objectTypesRoute = {
  body: {
    data: OBJECT_TYPES,
    pagination: { cursor: "end", hasMore: false },
  },
  method: "GET",
  path: "/ontology/objects/object-types",
};

describe("frontal sync --check (offline)", () => {
  it("exits 0 with no credentials when committed files match", async () => {
    committedProject();

    const result = await runCli(["sync", "--check"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("generated files match");
  });

  it("exits non-zero when a committed generated file was edited", async () => {
    committedProject();
    writeFileSync(join(root, ".frontal", "client.ts"), "// drifted\n");

    const result = await runCli(["sync", "--check", "--json"]);

    expect(result.exitCode).toBe(2);
    const report = lastJson(result.stdout) as { stale: string[] };
    expect(report.stale).toEqual(["client.ts"]);
  });

  it("exits non-zero when ontology.json is missing", async () => {
    cpSync(
      join(FIXTURE, ".frontal", "config.jsonc"),
      join(root, ".frontal", "config.jsonc"),
      {
        recursive: true,
      }
    );

    const result = await runCli(["sync", "--check"]);

    expect(result.exitCode).toBe(2);
    expect(existsSync(join(root, ".frontal", "ontology.json"))).toBe(false);
  });
});

describe("frontal sync", () => {
  it("fails with an auth error when no credentials are configured", async () => {
    committedProject();

    const result = await runCli(["sync"]);

    expect(result.exitCode).toBe(3);
  });

  it("downloads, writes the generated files, and is idempotent", async () => {
    cpSync(
      join(FIXTURE, ".frontal", "config.jsonc"),
      join(root, ".frontal", "config.jsonc"),
      {
        recursive: true,
      }
    );
    await mockApi([objectTypesRoute]);

    const first = await runCli(["sync", "--json"]);
    expect(first.exitCode).toBe(0);
    const firstReport = lastJson(first.stdout) as {
      files: Record<string, string>;
      entityCount: number;
    };
    expect(firstReport.entityCount).toBe(3);
    expect(firstReport.files.types).toBe("created");

    const expected = readFileSync(
      join(FIXTURE, ".frontal", "ontology.d.ts"),
      "utf-8"
    );
    expect(readFileSync(join(root, ".frontal", "ontology.d.ts"), "utf-8")).toBe(
      expected
    );

    const second = await runCli(["sync"]);
    expect(second.exitCode).toBe(0);
    expect(second.stdout.join("\n")).toContain("already synchronised");
  });
});

describe("frontal status", () => {
  it("reports OUTDATED before the first sync, then UP TO DATE after it", async () => {
    cpSync(
      join(FIXTURE, ".frontal", "config.jsonc"),
      join(root, ".frontal", "config.jsonc"),
      {
        recursive: true,
      }
    );
    await mockApi([objectTypesRoute]);

    const before = await runCli(["status", "--json"]);
    expect(before.exitCode).toBe(0);
    expect(lastJson(before.stdout)).toMatchObject({ status: "OUTDATED" });

    await runCli(["sync"]);

    const after = await runCli(["status", "--json"]);
    expect(lastJson(after.stdout)).toMatchObject({
      status: "UP TO DATE",
      upToDate: true,
    });
  });
});
