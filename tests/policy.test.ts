import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MockRoute } from "@frontal-labs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initProject } from "@/commands/init.js";
import { DevServer } from "@/lib/dev/server.js";
import { lastJson, mockApi, runCli } from "./helpers/cli.js";

let root: string;
let server: DevServer | undefined;

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
const score = (value: number): MockRoute => ({
  body: { score: value },
  method: "GET",
  path: "/compliance/score",
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-policy-"));
  initProject(root, {});
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(async () => {
  await server?.stop();
  server = undefined;
  rmSync(root, { force: true, recursive: true });
});

describe("frontal policy check", () => {
  it("passes when access is allowed for every enabled service", async () => {
    const mock = await mockApi([profile, activePolicies, allow, score(92)]);

    const result = await runCli(["policy", "check", "--json"]);

    expect(result.exitCode).toBe(0);
    const report = lastJson(result.stdout) as {
      passed: boolean;
      ruleResults: { ruleId: string; result: string }[];
      userId: string;
    };
    expect(report.passed).toBe(true);
    expect(report.userId).toBe("usr_1");
    expect(report.ruleResults.map((r) => r.ruleId)).toEqual([
      "policies:active",
      "access:deploy:agents",
      "access:deploy:ai",
      "access:deploy:graph",
      "compliance:score",
    ]);
    expect(mock.callCount("POST", "/access/check")).toBe(3);
    mock.expectCalledWith("POST", "/access/check", {
      action: "deploy",
      resourceType: "agents",
      roleNames: ["developer"],
      userId: "usr_1",
    });
  });

  it("exits 1 on a deny and prints the reason and fix", async () => {
    await mockApi([
      profile,
      activePolicies,
      {
        body: { allowed: false, reason: "prod freeze" },
        method: "POST",
        path: "/access/check",
      },
      score(95),
    ]);

    const result = await runCli(["policy", "check"]);

    expect(result.exitCode).toBe(1);
    const out = result.stdout.join("\n");
    expect(out).toContain("access:deploy:agents");
    expect(out).toContain("prod freeze");
    expect(out).toContain("fix:");
    expect(out).toContain("policy check failed (3 denied");
  });

  it("turns warnings into errors with --strict", async () => {
    await mockApi([
      profile,
      {
        body: { data: [], pagination: { cursor: "end", has_more: false } },
        method: "GET",
        path: "/policies",
      },
      allow,
      score(40),
    ]);

    const lenient = await runCli(["policy", "check", "--json"]);
    expect(lenient.exitCode).toBe(0);
    expect(
      (lastJson(lenient.stdout) as { summary: { warn: number } }).summary.warn
    ).toBe(2);

    const strict = await runCli(["policy", "check", "--strict", "--json"]);
    expect(strict.exitCode).toBe(1);
    const report = lastJson(strict.stdout) as {
      summary: { deny: number; warn: number };
    };
    expect(report.summary).toMatchObject({ deny: 2, warn: 0 });
  });

  it("validates local policy files and uses --user/--role instead of the profile", async () => {
    const dir = join(root, ".frontal", "policies");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "good.json"), JSON.stringify({ deny: [] }));
    writeFileSync(join(dir, "bad.rego"), "package x\n");
    writeFileSync(join(dir, "broken.json"), "{ nope");
    const mock = await mockApi([
      { body: { valid: true }, method: "POST", path: "/policies/validate" },
      activePolicies,
      allow,
      score(90),
    ]);

    const result = await runCli([
      "policy",
      "check",
      "--user",
      "usr_9",
      "--role",
      "admin",
      "--role",
      "ops",
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(mock.callCount("GET", "/auth/account/profile")).toBe(0);
    const validations = mock.requests
      .filter((r) => r.path.endsWith("/policies/validate"))
      .map((r) => r.body as { definition: unknown; definitionFormat: string });
    expect(validations).toEqual([
      { definition: "package x\n", definitionFormat: "rego" },
      { definition: { deny: [] }, definitionFormat: "json_schema" },
    ]);
    mock.expectCalledWith("POST", "/access/check", {
      roleNames: ["admin", "ops"],
      userId: "usr_9",
    });
    const report = lastJson(result.stdout) as {
      ruleResults: { ruleId: string; result: string; reason?: string }[];
    };
    const byId = Object.fromEntries(
      report.ruleResults.map((r) => [r.ruleId, r])
    );
    expect(byId["policy-file:.frontal/policies/bad.rego"]?.result).toBe("pass");
    expect(byId["policy-file:.frontal/policies/good.json"]?.result).toBe(
      "pass"
    );
    expect(byId["policy-file:.frontal/policies/broken.json"]).toMatchObject({
      reason: expect.stringContaining("not valid JSON"),
      result: "deny",
    });
  });

  it("runs against frontal dev with a deny scenario", async () => {
    const scenarios = join(root, ".frontal", "scenarios");
    mkdirSync(scenarios, { recursive: true });
    writeFileSync(
      join(scenarios, "deny.json"),
      JSON.stringify({
        routes: [
          {
            body: { allowed: false, reason: "frozen" },
            method: "POST",
            path: "/access/check",
          },
        ],
      })
    );
    server = new DevServer({
      globalOpts: {},
      port: 0,
      root,
      scenario: "deny",
      watch: false,
    });
    const info = await server.start();

    const ok = await runCli([
      "policy",
      "check",
      "--api-key",
      "frt_local_dev_key_000",
      "--api-url",
      `${info.url}/v1`,
      "--json",
    ]);
    expect(ok.exitCode).toBe(1);
    const report = lastJson(ok.stdout) as {
      userId: string;
      summary: { deny: number };
    };
    expect(report.userId).toBe("usr_local_dev");
    expect(report.summary.deny).toBe(3);
  });
});
