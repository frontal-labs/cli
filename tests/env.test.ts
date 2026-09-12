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
      name: "envapp",
      env: "dev",
      apiUrl: "https://api.test.frontal.dev/v1",
      services: { agents: {} },
      vars: { LOG_LEVEL: "info", REGION: "eu" },
      secrets: { required: ["FRONTAL_API_KEY", "OPENAI_API_KEY"] },
    })
  );
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildEnvFile", () => {
  it("writes vars, keeps existing secrets and leaves placeholders for missing ones", async () => {
    const config = await validateProjectConfig(
      parseJsonc(readFileSync(join(root, "frontal.jsonc"), "utf-8"))
    );
    const built = buildEnvFile({
      config,
      existing: { OPENAI_API_KEY: "sk-keep", EXTRA: "x", LOG_LEVEL: "debug" },
      defaults: { FRONTAL_API_KEY: TEST_API_KEY },
    });
    const parsed = parseDotenv(built.content);
    expect(parsed).toEqual({
      FRONTAL_API_URL: "https://api.test.frontal.dev/v1",
      FRONTAL_API_KEY: TEST_API_KEY,
      OPENAI_API_KEY: "sk-keep",
      LOG_LEVEL: "info",
      REGION: "eu",
      EXTRA: "x",
    });
    expect(built.written).toEqual([
      "FRONTAL_API_URL",
      "FRONTAL_API_KEY",
      "LOG_LEVEL",
      "REGION",
    ]);
    expect(built.preserved).toEqual(["OPENAI_API_KEY", "EXTRA"]);
    expect(built.missing).toEqual([]);

    const empty = buildEnvFile({ config, existing: {}, defaults: {} });
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
      written: expect.arrayContaining(["FRONTAL_API_KEY", "LOG_LEVEL"]),
      missing: ["OPENAI_API_KEY"],
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
      OPENAI_API_KEY: "sk-mine",
      CUSTOM: "1",
      LOG_LEVEL: "info",
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
      id: "dep_1",
      name: "envapp-preview",
      env: "dev",
      target: "preview",
      url: "https://api.test.frontal.dev/v1/workers/envapp-preview",
      entrypoint: "index.js",
      artifactDir,
      sha: "abc",
      createdAt: new Date().toISOString(),
    });
    writeFileSync(
      join(root, ".env.local"),
      `FRONTAL_API_KEY=${TEST_API_KEY}\nFRONTAL_API_URL=https://api.test.frontal.dev/v1\nOPENAI_API_KEY=sk-secret-value\nLOG_LEVEL=debug\n`
    );
    const mock = await mockApi([
      { method: "GET", path: "/auth/account/profile", body: { id: "usr_1" } },
      {
        method: "POST",
        path: "/workers",
        status: 201,
        body: { name: "envapp-preview" },
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
      name: "envapp-preview",
      entrypoint: "index.js",
      code: "export default () => 'hi';",
    });
    expect(body.envVars).toEqual({
      LOG_LEVEL: "debug",
      REGION: "eu",
      OPENAI_API_KEY: "sk-secret-value",
    });
    expect(body.envVars.FRONTAL_API_KEY).toBeUndefined();
    expect(lastJson(result.stdout)).toMatchObject({
      deployment: "envapp-preview",
      keys: ["LOG_LEVEL", "OPENAI_API_KEY", "REGION"],
    });
    expect(result.stdout.join("\n")).not.toContain("sk-secret-value");
  });
});
