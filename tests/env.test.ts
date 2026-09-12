import {
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
import { buildEnvFile } from "@/commands/env.js";
import { initProject } from "@/commands/init.js";
import { validateProjectConfig } from "@/lib/config.js";
import { writeCurrentDeploy } from "@/lib/deploys.js";
import { parseDotenv, parseJsonc } from "@/lib/project.js";
import { lastJson, mockApi, runCli, TEST_API_KEY } from "./helpers/cli.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-env-"));
  initProject(root, {});
  writeFileSync(
    join(root, "frontal.jsonc"),
    JSON.stringify({
      apiUrl: "https://api.test.frontal.dev/v1",
      env: "dev",
      name: "envapp",
      secrets: { required: ["FRONTAL_API_KEY", "OPENAI_API_KEY"] },
      services: { agents: {} },
      vars: { LOG_LEVEL: "info", REGION: "eu" },
    })
  );
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("buildEnvFile", () => {
  it("writes vars, keeps existing secrets and leaves placeholders for missing ones", async () => {
    const config = await validateProjectConfig(
      parseJsonc(readFileSync(join(root, "frontal.jsonc"), "utf-8"))
    );
    const built = buildEnvFile({
      config,
      defaults: { FRONTAL_API_KEY: TEST_API_KEY },
      existing: { EXTRA: "x", LOG_LEVEL: "debug", OPENAI_API_KEY: "sk-keep" },
    });
    const parsed = parseDotenv(built.content);
    expect(parsed).toEqual({
      EXTRA: "x",
      FRONTAL_API_KEY: TEST_API_KEY,
      FRONTAL_API_URL: "https://api.test.frontal.dev/v1",
      LOG_LEVEL: "info",
      OPENAI_API_KEY: "sk-keep",
      REGION: "eu",
    });
    expect(built.written).toEqual([
      "FRONTAL_API_URL",
      "FRONTAL_API_KEY",
      "LOG_LEVEL",
      "REGION",
    ]);
    expect(built.preserved).toEqual(["OPENAI_API_KEY", "EXTRA"]);
    expect(built.missing).toEqual([]);

    const empty = buildEnvFile({ config, defaults: {}, existing: {} });
    expect(empty.missing).toEqual(["FRONTAL_API_KEY", "OPENAI_API_KEY"]);
    expect(empty.content).toContain("FRONTAL_API_KEY=\n");
  });
});

describe("frontal env pull", () => {
  it("creates .env.local from the config and the active credential, never printing secrets", async () => {
    const result = await runCli([
      "env",
      "pull",
      "--api-key",
      TEST_API_KEY,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const file = join(root, ".env.local");
    expect(existsSync(file)).toBe(true);
    expect(parseDotenv(readFileSync(file, "utf-8"))).toMatchObject({
      FRONTAL_API_KEY: TEST_API_KEY,
      LOG_LEVEL: "info",
      OPENAI_API_KEY: "",
    });
    expect(lastJson(result.stdout)).toMatchObject({
      missing: ["OPENAI_API_KEY"],
      written: expect.arrayContaining(["FRONTAL_API_KEY", "LOG_LEVEL"]),
    });
    expect(result.stdout.join("\n")).not.toContain(TEST_API_KEY);
  });

  it("refuses to overwrite without --force and merges with it", async () => {
    const file = join(root, ".env.local");
    writeFileSync(file, "OPENAI_API_KEY=sk-mine\nCUSTOM=1\n");

    const refused = await runCli(["env", "pull", "--json"]);
    expect(refused.exitCode).toBe(1);
    expect(lastJson(refused.stderr).error).toMatchObject({
      code: "ENV_FILE_EXISTS",
    });
    expect(readFileSync(file, "utf-8")).toBe(
      "OPENAI_API_KEY=sk-mine\nCUSTOM=1\n"
    );

    const forced = await runCli(["env", "pull", "--force", "--json"]);
    expect(forced.exitCode).toBe(0);
    expect(parseDotenv(readFileSync(file, "utf-8"))).toMatchObject({
      CUSTOM: "1",
      LOG_LEVEL: "info",
      OPENAI_API_KEY: "sk-mine",
    });
    expect(lastJson(forced.stdout)).toMatchObject({
      preserved: expect.arrayContaining(["OPENAI_API_KEY", "CUSTOM"]),
    });
  });

  it("honours --env overlays and a custom file name", async () => {
    writeFileSync(
      join(root, "frontal.staging.jsonc"),
      '{ "vars": { "REGION": "us" } }'
    );
    const result = await runCli([
      "env",
      "pull",
      ".env.staging",
      "--env",
      "staging",
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(
      parseDotenv(readFileSync(join(root, ".env.staging"), "utf-8")).REGION
    ).toBe("us");
  });
});

describe("frontal env push", () => {
  it("fails clearly without a file, with missing secrets, and without a deployment", async () => {
    const noFile = await runCli(["env", "push", "--json"]);
    expect(lastJson(noFile.stderr).error).toMatchObject({
      code: "ENV_FILE_MISSING",
    });

    writeFileSync(
      join(root, ".env.local"),
      `FRONTAL_API_KEY=${TEST_API_KEY}\n`
    );
    const missing = await runCli(["env", "push", "--json"]);
    expect(missing.exitCode).toBe(2);
    expect(lastJson(missing.stderr).error).toMatchObject({
      code: "MISSING_SECRETS",
      message: expect.stringContaining("OPENAI_API_KEY"),
    });

    writeFileSync(
      join(root, ".env.local"),
      `FRONTAL_API_KEY=${TEST_API_KEY}\nOPENAI_API_KEY=sk-x\n`
    );
    const noDeploy = await runCli(["env", "push", "--json"]);
    expect(noDeploy.exitCode).toBe(6);
    expect(lastJson(noDeploy.stderr).error).toMatchObject({
      code: "NO_DEPLOYMENT",
      fix: expect.stringContaining("frontal deploy"),
    });
  });

  it("verifies the credential and redeploys the worker with the variables", async () => {
    const artifactDir = join(root, ".frontal", "build");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "index.js"), "export default () => 'hi';");
    writeCurrentDeploy(root, {
      artifactDir,
      createdAt: new Date().toISOString(),
      entrypoint: "index.js",
      env: "dev",
      id: "dep_1",
      name: "envapp-preview",
      sha: "abc",
      target: "preview",
      url: "https://api.test.frontal.dev/v1/workers/envapp-preview",
    });
    writeFileSync(
      join(root, ".env.local"),
      `FRONTAL_API_KEY=${TEST_API_KEY}\nFRONTAL_API_URL=https://api.test.frontal.dev/v1\nOPENAI_API_KEY=sk-secret-value\nLOG_LEVEL=debug\n`
    );
    const mock = await mockApi([
      { body: { id: "usr_1" }, method: "GET", path: "/auth/account/profile" },
      {
        body: { name: "envapp-preview" },
        method: "POST",
        path: "/workers",
        status: 201,
      },
    ]);

    const result = await runCli(["env", "push", "--json"]);

    expect(result.exitCode).toBe(0);
    mock.expectCalled("GET", "/auth/account/profile");
    const deploy = mock.expectCalled("POST", "/workers");
    // Variable names must reach the wire untouched (the mock camelCases the
    // top-level keys back, but leaves the exact env var names alone).
    const body = deploy.body as { envVars: Record<string, string> };
    expect(deploy.body).toMatchObject({
      code: "export default () => 'hi';",
      entrypoint: "index.js",
      name: "envapp-preview",
    });
    expect(body.envVars).toEqual({
      LOG_LEVEL: "debug",
      OPENAI_API_KEY: "sk-secret-value",
      REGION: "eu",
    });
    expect(body.envVars.FRONTAL_API_KEY).toBeUndefined();
    expect(lastJson(result.stdout)).toMatchObject({
      deployment: "envapp-preview",
      keys: ["LOG_LEVEL", "OPENAI_API_KEY", "REGION"],
    });
    expect(result.stdout.join("\n")).not.toContain("sk-secret-value");
  });
});
