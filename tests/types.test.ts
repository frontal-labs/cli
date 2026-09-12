import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENERATED_HEADER,
  generateTypes,
  renderTypes,
} from "@/commands/types.js";
import { validateProjectConfig } from "@/lib/config.js";
import { parseJsonc } from "@/lib/project.js";
import { lastJson, runCli } from "./helpers/cli.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures");
const FIXTURE = readFileSync(join(FIXTURE_DIR, "frontal.jsonc"), "utf-8");
const REPO_ROOT = resolve(import.meta.dirname, "..");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-types-"));
  writeFileSync(join(root, "frontal.jsonc"), FIXTURE);
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("renderTypes", () => {
  it("matches the snapshot for the fixture project", async () => {
    const config = await validateProjectConfig(parseJsonc(FIXTURE));
    const output = renderTypes(config, ["frontal.jsonc"]);
    expect(output.startsWith(GENERATED_HEADER)).toBe(true);
    await expect(output).toMatchFileSnapshot(
      join(FIXTURE_DIR, "frontal-configuration.d.ts.snap")
    );
  });

  it("emits vars, secrets and services from the config", async () => {
    const config = await validateProjectConfig(parseJsonc(FIXTURE));
    const output = renderTypes(config, ["frontal.jsonc"]);
    expect(output).toContain("LOG_LEVEL: string;");
    expect(output).toContain("OPENAI_API_KEY: string;");
    expect(output).toContain('ai: { remote: true; client: FrontalSdk["ai"] };');
    expect(output).toContain('name: "fixture-app";');
    expect(output).toContain("interface ProcessEnv extends FrontalEnv {}");
  });
});

describe("generateTypes", () => {
  it("writes the file, reports up-to-date on rerun and compiles with tsc", async () => {
    const first = await generateTypes({ cwd: root });
    expect(first.changed).toBe(true);
    expect(first.out).toBe(join(root, "src", "frontal-configuration.d.ts"));
    expect(first.services).toEqual(["agents", "ai", "graph"]);

    const second = await generateTypes({ cwd: root });
    expect(second.changed).toBe(false);

    // The output must type-check against the installed SDK.
    const check = join(REPO_ROOT, `.tmp-types-${process.pid}`);
    mkdirSync(check, { recursive: true });
    try {
      writeFileSync(
        join(check, "frontal-configuration.d.ts"),
        readFileSync(first.out, "utf-8")
      );
      writeFileSync(
        join(check, "use.ts"),
        [
          'import type { FrontalProject, FrontalServices } from "./frontal-configuration.js";',
          "const key: string = process.env.FRONTAL_API_KEY;",
          "const region: string = process.env.REGION;",
          'declare const agents: FrontalServices["agents"]["client"];',
          "const page = agents.list();",
          'const name: FrontalProject["name"] = "fixture-app";',
          "export { key, region, page, name };",
          "",
        ].join("\n")
      );
      const proc = spawnSync(
        "bun",
        [
          "x",
          "tsc",
          "--noEmit",
          "--ignoreConfig",
          "--strict",
          "--skipLibCheck",
          "--module",
          "esnext",
          "--moduleResolution",
          "bundler",
          "--target",
          "es2022",
          "--types",
          "node",
          join(check, "use.ts"),
        ],
        { cwd: REPO_ROOT, encoding: "utf-8" }
      );
      expect(proc.stdout + proc.stderr).toBe("");
      expect(proc.status).toBe(0);
    } finally {
      rmSync(check, { force: true, recursive: true });
    }
  }, 60_000);

  it("applies the --env overlay and honours --out", async () => {
    writeFileSync(
      join(root, "frontal.staging.jsonc"),
      '{ "services": { "workflows": {} }, "vars": { "TIER": "gold" } }'
    );
    const result = await generateTypes({
      cwd: root,
      env: "staging",
      out: "types/f.d.ts",
    });
    expect(result.out).toBe(join(root, "types", "f.d.ts"));
    expect(result.services).toContain("workflows");
    expect(result.vars).toContain("TIER");
    expect(readFileSync(result.out, "utf-8")).toContain(
      "frontal.jsonc + frontal.staging.jsonc"
    );
  });
});

describe("frontal types (CLI)", () => {
  it("fails with NO_PROJECT outside a project and succeeds inside", async () => {
    const empty = mkdtempSync(join(tmpdir(), "frontal-empty-"));
    try {
      vi.spyOn(process, "cwd").mockReturnValue(empty);
      const missing = await runCli(["types", "--json"]);
      expect(missing.exitCode).toBe(6);
      expect(lastJson(missing.stderr).error).toMatchObject({
        code: "NO_PROJECT",
      });
    } finally {
      rmSync(empty, { force: true, recursive: true });
    }

    vi.spyOn(process, "cwd").mockReturnValue(root);
    const ok = await runCli(["types", "--json"]);
    expect(ok.exitCode).toBe(0);
    expect(lastJson(ok.stdout)).toMatchObject({
      changed: true,
      secrets: ["FRONTAL_API_KEY", "OPENAI_API_KEY"],
    });
  });
});
