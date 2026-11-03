import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "@/errors/cli-error.js";
import {
  envOverlayCandidates,
  findProjectRoot,
  loadRawProjectConfig,
  projectConfigRelPath,
} from "@/lib/project.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-config-location-"));
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

function write(rel: string, content: string): void {
  const file = join(root, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

describe("project config location", () => {
  it("finds .frontal/config.jsonc from a nested directory", () => {
    write(".frontal/config.jsonc", '{ "name": "app" }');
    const nested = join(root, "packages", "web");
    mkdirSync(nested, { recursive: true });

    expect(findProjectRoot(nested)).toBe(root);
    expect(projectConfigRelPath(root)).toBe(".frontal/config.jsonc");
  });

  it("falls back to the legacy root frontal.jsonc", () => {
    write("frontal.jsonc", '{ "name": "legacy" }');

    expect(findProjectRoot(root)).toBe(root);
    expect(projectConfigRelPath(root)).toBe("frontal.jsonc");
    expect(loadRawProjectConfig({ cwd: root }).raw).toMatchObject({
      name: "legacy",
    });
  });

  it("prefers .frontal/config.jsonc when both locations exist", () => {
    write(".frontal/config.jsonc", '{ "name": "new" }');
    write("frontal.jsonc", '{ "name": "legacy" }');

    expect(loadRawProjectConfig({ cwd: root }).raw).toMatchObject({
      name: "new",
    });
    expect(loadRawProjectConfig({ cwd: root }).files).toEqual([
      join(root, ".frontal", "config.jsonc"),
    ]);
  });

  it("reports NO_PROJECT when neither location exists", () => {
    let caught: unknown;
    try {
      loadRawProjectConfig({ cwd: root });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).code).toBe("NO_PROJECT");
  });

  it("merges the .frontal/config.<env>.jsonc overlay with the new base", () => {
    write(
      ".frontal/config.jsonc",
      '{ "name": "app", "vars": { "REGION": "eu" } }'
    );
    write(".frontal/config.staging.jsonc", '{ "vars": { "REGION": "us" } }');

    const loaded = loadRawProjectConfig({ cwd: root, env: "staging" });
    expect(loaded.raw.vars).toEqual({ REGION: "us" });
    expect(loaded.files).toEqual([
      join(root, ".frontal", "config.jsonc"),
      join(root, ".frontal", "config.staging.jsonc"),
    ]);
  });

  it("still reads a legacy frontal.<env>.jsonc overlay when the base moved to .frontal/", () => {
    write(
      ".frontal/config.jsonc",
      '{ "name": "app", "vars": { "REGION": "eu" } }'
    );
    write("frontal.staging.jsonc", '{ "vars": { "REGION": "us" } }');

    expect(
      loadRawProjectConfig({ cwd: root, env: "staging" }).raw.vars
    ).toEqual({
      REGION: "us",
    });
  });

  it("lists overlay candidates in lookup order", () => {
    expect(envOverlayCandidates(".frontal/config.jsonc", "dev")).toEqual([
      ".frontal/config.dev.jsonc",
      "frontal.dev.jsonc",
    ]);
    expect(envOverlayCandidates("frontal.jsonc", "dev")).toEqual([
      "frontal.dev.jsonc",
    ]);
  });
});
