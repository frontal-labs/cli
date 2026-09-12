import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkRequiredSecrets,
  loadProjectConfig,
  tryLoadProjectConfig,
  validateProjectConfig,
} from "@/lib/config.js";
import {
  findProjectRoot,
  loadDotenvLocal,
  parseDotenv,
  parseJsonc,
  renderProjectConfig,
} from "@/lib/project.js";

const FIXTURE = readFileSync(
  join(import.meta.dirname, "fixtures", "frontal.jsonc"),
  "utf-8"
);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-config-"));
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("parseJsonc", () => {
  it("strips comments and trailing commas but keeps them inside strings", () => {
    const parsed = parseJsonc(`{
      // line comment
      "a": "http://x/y", /* block */
      "b": "// not a comment",
      "c": [1, 2,],
    }`);
    expect(parsed).toEqual({
      a: "http://x/y",
      b: "// not a comment",
      c: [1, 2],
    });
  });

  it("round-trips the init template", () => {
    expect(parseJsonc(renderProjectConfig("demo"))).toMatchObject({
      name: "demo",
      services: { ai: { remote: false } },
    });
  });
});

describe("validateProjectConfig", () => {
  it("accepts the fixture and applies defaults", async () => {
    const config = await validateProjectConfig(parseJsonc(FIXTURE));
    expect(config.name).toBe("fixture-app");
    expect(config.services.ai?.remote).toBe(true);
    expect(config.sdk?.timeout).toBe(5000);
  });

  it("rejects unknown services with a hint listing valid keys", async () => {
    await expect(
      validateProjectConfig({ name: "x", services: { nope: {} } })
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      exitCode: 6,
      fix: expect.stringContaining("agents, ai, audit"),
      message: expect.stringContaining('Unknown service "nope"'),
    });
  });

  it("reuses the SDK url rule for apiUrl", async () => {
    await expect(
      validateProjectConfig({ apiUrl: "ftp://nope", name: "x" })
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("apiUrl"),
    });
  });

  it("rejects unknown top-level keys and bad var names", async () => {
    await expect(
      validateProjectConfig({ extra: 1, name: "x" })
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await expect(
      validateProjectConfig({ name: "x", vars: { "lower-case": "v" } })
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});

describe("loadProjectConfig", () => {
  it("finds the root from a nested directory and merges the env overlay", async () => {
    writeFileSync(join(root, "frontal.jsonc"), FIXTURE);
    writeFileSync(
      join(root, "frontal.staging.jsonc"),
      `{ "apiUrl": "https://api.staging.frontal.dev/v1", "services": { "graph": { "remote": true } }, "vars": { "REGION": "us-east-1" } }`
    );
    const nested = join(root, "src", "deep");
    mkdirSync(nested, { recursive: true });

    expect(findProjectRoot(nested)).toBe(root);

    const base = await loadProjectConfig({ cwd: nested });
    expect(base.config.env).toBe("dev");
    expect(base.config.services.graph?.remote).toBe(false);

    const staging = await loadProjectConfig({ cwd: nested, env: "staging" });
    expect(staging.files).toHaveLength(2);
    expect(staging.config.env).toBe("staging");
    expect(staging.config.apiUrl).toBe("https://api.staging.frontal.dev/v1");
    expect(staging.config.services.graph?.remote).toBe(true);
    expect(staging.config.services.ai?.remote).toBe(true);
    expect(staging.config.vars).toEqual({
      LOG_LEVEL: "info",
      REGION: "us-east-1",
    });
  });

  it("fails with NO_PROJECT outside a project", async () => {
    await expect(loadProjectConfig({ cwd: root })).rejects.toMatchObject({
      code: "NO_PROJECT",
      exitCode: 6,
    });
    expect(await tryLoadProjectConfig({ cwd: root })).toBeUndefined();
  });

  it("rejects an unknown --env", async () => {
    writeFileSync(join(root, "frontal.jsonc"), FIXTURE);
    await expect(
      loadProjectConfig({ cwd: root, env: "qa" })
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      fix: expect.stringContaining("dev, staging, prod"),
    });
  });

  it("reports parse errors with the file name", async () => {
    writeFileSync(join(root, "frontal.jsonc"), "{ not json");
    await expect(loadProjectConfig({ cwd: root })).rejects.toMatchObject({
      code: "CONFIG_PARSE_ERROR",
    });
  });
});

describe("dotenv + secrets", () => {
  it("parses .env.local without touching process.env", () => {
    writeFileSync(
      join(root, ".env.local"),
      `# comment\nexport FRONTAL_API_KEY="frt_local_key_000000"\nFRONTAL_API_URL=http://localhost:8787/v1 # trailing\nEMPTY=\n`
    );
    expect(loadDotenvLocal(root)).toEqual({
      EMPTY: "",
      FRONTAL_API_KEY: "frt_local_key_000000",
      FRONTAL_API_URL: "http://localhost:8787/v1",
    });
    expect(process.env.FRONTAL_API_KEY).toBeUndefined();
    expect(parseDotenv("A='x y'")).toEqual({ A: "x y" });
  });

  it("reports missing required secrets", async () => {
    const config = await validateProjectConfig(parseJsonc(FIXTURE));
    expect(
      checkRequiredSecrets(config, { FRONTAL_API_KEY: "frt_x" }).missing
    ).toEqual(["OPENAI_API_KEY"]);
  });
});
