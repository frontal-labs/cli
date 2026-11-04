import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError } from "@/errors/cli-error.js";
import { loadProjectConfig } from "@/lib/config.js";
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
    expect(envOverlayCandidates("dev")).toEqual([
      ".frontal/config.dev.jsonc",
      ".frontal/config.dev.json",
      "frontal.dev.jsonc",
      "frontal.dev.json",
    ]);
  });
});

/** Every accepted base config location, with a config that names itself. */
const LAYOUTS = [
  ".frontal/config.jsonc",
  ".frontal/config.json",
  "frontal.jsonc",
  "frontal.json",
] as const;

/** Every overlay location for `staging`, in lookup order. */
const OVERLAYS = [
  ".frontal/config.staging.jsonc",
  ".frontal/config.staging.json",
  "frontal.staging.jsonc",
  "frontal.staging.json",
] as const;

function baseConfig(name: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ name, vars: { REGION: "eu" }, ...extra });
}

describe.each(LAYOUTS)("base config at %s", (rel) => {
  it("is the project config and loads through loadProjectConfig", async () => {
    write(rel, baseConfig("matrix"));
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const loaded = await loadProjectConfig({ cwd: root });

    expect(loaded.config.name).toBe("matrix");
    expect(loaded.files).toEqual([join(root, rel)]);
    expect(loaded.warnings).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("makes its directory the project root from a nested path", () => {
    write(rel, baseConfig("matrix"));
    const nested = join(root, "packages", "web");
    mkdirSync(nested, { recursive: true });

    expect(findProjectRoot(nested)).toBe(root);
  });
});

describe.each(OVERLAYS)("overlay at %s", (overlay) => {
  it("is merged over the .frontal/config.jsonc base", async () => {
    write(".frontal/config.jsonc", baseConfig("matrix"));
    write(overlay, JSON.stringify({ vars: { REGION: "us" } }));

    const loaded = await loadProjectConfig({ cwd: root, env: "staging" });

    expect(loaded.config.vars).toEqual({ REGION: "us" });
    expect(loaded.files).toEqual([
      join(root, ".frontal/config.jsonc"),
      join(root, overlay),
    ]);
  });
});

describe("precedence and warnings", () => {
  it("uses the first base config and names the ignored ones", async () => {
    write(".frontal/config.jsonc", baseConfig("first"));
    write("frontal.jsonc", baseConfig("second"));
    write("frontal.json", baseConfig("third"));

    const raw = loadRawProjectConfig({ cwd: root });
    expect(raw.raw.name).toBe("first");
    expect(raw.warnings).toEqual([
      "Using .frontal/config.jsonc; ignoring frontal.jsonc, frontal.json. Keep one project config and remove the others.",
    ]);
  });

  it("prints a multi-config warning once per process", async () => {
    write(".frontal/config.jsonc", baseConfig("first"));
    write("frontal.json", baseConfig("second"));
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await loadProjectConfig({ cwd: root });
    const second = await loadProjectConfig({ cwd: root });

    expect(second.warnings).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("ignoring frontal.json");
    warn.mockRestore();
  });

  it("does not treat a .frontal/ with only state/ as a project root", () => {
    mkdirSync(join(root, ".frontal", "state"), { recursive: true });

    expect(findProjectRoot(root)).toBeUndefined();
  });
});

describe("legacy frontal.json", () => {
  it("loads web-deploy settings through the same validator", async () => {
    write(
      "frontal.json",
      JSON.stringify({
        build: { installCommand: "bun install" },
        deployment: { production: { enabled: true } },
        features: { analytics: true },
        framework: "nextjs",
        functions: {
          "api/hello.ts": {
            maxDuration: 10,
            memory: "512",
            runtime: "nodejs20.x",
          },
        },
        headers: [{ headers: { "X-Frame-Options": "DENY" }, source: "/*" }],
        name: "legacy-web",
        redirects: [{ destination: "/new", permanent: true, source: "/old" }],
        regions: ["us-east-1"],
        rewrites: [{ destination: "/v1/:x", source: "/api/:x" }],
      })
    );

    const loaded = await loadProjectConfig({ cwd: root });

    expect(loaded.config.name).toBe("legacy-web");
    expect(loaded.config.framework).toBe("nextjs");
    expect(loaded.config.regions).toEqual(["us-east-1"]);
    expect(loaded.config.redirects?.[0]).toMatchObject({ permanent: true });
  });

  it("rejects an unknown key with the key named", async () => {
    write(".frontal/config.jsonc", baseConfig("app", { bogusSetting: true }));

    let caught: unknown;
    try {
      await loadProjectConfig({ cwd: root });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).code).toBe("CONFIG_INVALID");
    expect((caught as CliError).message).toContain("bogusSetting");
  });
});
