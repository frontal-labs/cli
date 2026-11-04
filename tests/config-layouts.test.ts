/**
 * Commands work from every accepted config layout. Each case writes the same
 * project config to one location and runs a command that reads it. No real
 * credentials are used: the API is mocked, and the dev server runs locally.
 */
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
import type { MockRoute } from "@frontal-labs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevServer } from "@/lib/dev/server.js";
import { parseDotenv } from "@/lib/project.js";
import { lastJson, mockApi, runCli, TEST_API_KEY } from "./helpers/cli.js";

const LAYOUTS = [
  ".frontal/config.jsonc",
  ".frontal/config.json",
  "frontal.jsonc",
  "frontal.json",
] as const;

const CONFIG = {
  name: "layout-app",
  secrets: { required: ["FRONTAL_API_KEY"] },
  services: { agents: {} },
  vars: { LOG_LEVEL: "info" },
};

const profile: MockRoute = {
  body: { id: "usr_1", roles: [{ name: "developer" }] },
  method: "GET",
  path: "/auth/account/profile",
};
const activePolicies: MockRoute = {
  body: {
    data: [{ id: "pol_1", name: "baseline" }],
    pagination: { cursor: "end", has_more: false },
  },
  method: "GET",
  path: "/policies",
};
const allow: MockRoute = {
  body: { allowed: true },
  method: "POST",
  path: "/access/check",
};
const score: MockRoute = {
  body: { score: 92 },
  method: "GET",
  path: "/compliance/score",
};
const validate: MockRoute = {
  body: { valid: true },
  method: "POST",
  path: "/policies/validate",
};

let root: string;
let server: DevServer | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-layout-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(async () => {
  await server?.stop();
  server = undefined;
  vi.restoreAllMocks();
  rmSync(root, { force: true, recursive: true });
});

function writeLayout(rel: string): void {
  const file = join(root, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(CONFIG));
}

describe.each(LAYOUTS)("commands from %s", (rel) => {
  it("env pull reads the config and writes .env.local at the project root", async () => {
    writeLayout(rel);

    const result = await runCli([
      "env",
      "pull",
      "--api-key",
      TEST_API_KEY,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(lastJson(result.stdout)).toMatchObject({
      written: expect.arrayContaining(["LOG_LEVEL"]),
    });
    const env = parseDotenv(readFileSync(join(root, ".env.local"), "utf-8"));
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("frontal dev starts with the services from the config", async () => {
    writeLayout(rel);

    server = new DevServer({
      globalOpts: {},
      port: 0,
      root,
      watch: false,
    });
    const info = await server.start();

    expect(info.services).toHaveProperty("agents");
  });

  it("policy check reads the config and the policies under .frontal/policies", async () => {
    writeLayout(rel);
    const dir = join(root, ".frontal", "policies");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "good.json"), JSON.stringify({ deny: [] }));
    await mockApi([profile, activePolicies, allow, score, validate]);

    const result = await runCli(["policy", "check", "--json"]);

    expect(result.exitCode).toBe(0);
    const report = lastJson(result.stdout) as {
      ruleResults: { ruleId: string; result: string }[];
    };
    expect(report.ruleResults.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, "good.json"))).toBe(true);
  });
});
