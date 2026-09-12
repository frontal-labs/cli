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
import { workerName, workerUrl } from "@/commands/deploy.js";
import { initProject } from "@/commands/init.js";
import { snapshotStateSchema } from "@/lib/bundle.js";
import { listDeploys, readCurrentDeploy } from "@/lib/deploys.js";
import { DevServer } from "@/lib/dev/server.js";
import { parseJsonc } from "@/lib/project.js";
import { ProjectState } from "@/lib/state.js";
import { lastJson, mockApi, runCli, TEST_API_KEY } from "./helpers/cli.js";

let root: string;
let server: DevServer | undefined;

const workersRoute = {
  body: { name: "x" },
  headers: { "x-request-id": "req_deploy" },
  method: "POST",
  path: "/workers",
  status: 201,
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-deploy-"));
  initProject(root, { name: "app" });
  root = join(root, "app");
  writeFileSync(
    join(root, "src", "lib.ts"),
    'export const hello = () => "hi";\n'
  );
  writeFileSync(
    join(root, "src", "index.ts"),
    'import { hello } from "./lib.ts";\nexport default { fetch: () => new Response(hello()) };\n'
  );
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(async () => {
  await server?.stop();
  server = undefined;
  rmSync(join(root, ".."), { force: true, recursive: true });
});

describe("helpers", () => {
  it("derives worker names and urls", () => {
    expect(workerName("app", "preview")).toBe("app-preview");
    expect(workerName("app", "prod")).toBe("app");
    expect(workerUrl("https://api.frontal.dev/v1/", "app")).toBe(
      "https://api.frontal.dev/v1/workers/app"
    );
  });

  it("snapshots state schema without row data", () => {
    const state = new ProjectState(root);
    state.write("agents", "agt_1", {
      id: "agt_1",
      name: "secret-name",
      tags: [],
    });
    const snapshot = snapshotStateSchema(root);
    expect(snapshot).toEqual({
      agents: { fields: ["id", "name", "tags"], records: 1 },
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret-name");
  });
});

describe("frontal deploy", () => {
  it("--dry-run bundles the entry (imports resolved) and touches no network", async () => {
    const mock = await mockApi([]);

    const result = await runCli([
      "deploy",
      "--dry-run",
      "--outdir",
      "out",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(mock.requests).toHaveLength(0);
    const bundle = readFileSync(join(root, "out", "index.js"), "utf-8");
    expect(bundle).toContain("hi");
    expect(bundle).not.toContain("./lib");
    const manifest = JSON.parse(
      readFileSync(join(root, "out", "manifest.json"), "utf-8")
    ) as { name: string; sha: string; target: string };
    expect(manifest).toMatchObject({ name: "app-preview", target: "preview" });
    expect(lastJson(result.stdout)).toMatchObject({
      dryRun: true,
      sha: manifest.sha,
    });
    expect(listDeploys(root)).toHaveLength(0);
  });

  it("--preview posts the bundle to /workers, prints the url and records the deployment", async () => {
    const mock = await mockApi([workersRoute]);

    const result = await runCli(["deploy", "--preview", "--json"]);

    expect(result.exitCode).toBe(0);
    const request = mock.expectCalled("POST", "/workers");
    expect(request.body).toMatchObject({
      entrypoint: "index.js",
      envVars: {},
      name: "app-preview",
    });
    expect(String((request.body as { code: string }).code)).toContain("hi");
    const { record } = lastJson(result.stdout) as {
      record: {
        url: string;
        sha: string;
        artifactDir: string;
        requestId: string;
      };
    };
    expect(record.url).toBe(
      "https://api.test.frontal.dev/v1/workers/app-preview"
    );
    expect(record.requestId).toBe("req_deploy");
    expect(existsSync(join(record.artifactDir, "index.js"))).toBe(true);
    expect(readCurrentDeploy(root, "dev")?.sha).toBe(record.sha);
    expect(readCurrentDeploy(root, "dev", "preview")?.sha).toBe(record.sha);
  });

  it("--prod needs --yes when not interactive, then deploys under the project name", async () => {
    const mock = await mockApi([workersRoute]);

    const refused = await runCli(["deploy", "--prod", "--json"]);
    expect(refused.exitCode).toBe(1);
    expect(lastJson(refused.stderr).error).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(mock.requests).toHaveLength(0);

    const ok = await runCli(["deploy", "--prod", "--yes", "--json"]);
    expect(ok.exitCode).toBe(0);
    expect(mock.expectCalled("POST", "/workers").body).toMatchObject({
      name: "app",
    });
    expect(readCurrentDeploy(root, "dev", "prod")?.name).toBe("app");
  });

  it("rejects --preview together with --prod and a missing entry", async () => {
    await mockApi([]);
    const both = await runCli(["deploy", "--preview", "--prod", "--json"]);
    expect(lastJson(both.stderr).error).toMatchObject({
      code: "INVALID_TARGET",
    });

    rmSync(join(root, "src", "index.ts"));
    const missing = await runCli(["deploy", "--dry-run", "--json"]);
    expect(missing.exitCode).toBe(6);
    expect(lastJson(missing.stderr).error).toMatchObject({
      code: "ENTRY_NOT_FOUND",
    });
  });
});

describe("frontal promote / rollback", () => {
  it("promote re-sends the preview artifact under the prod name without rebuilding", async () => {
    const mock = await mockApi([workersRoute]);
    const preview = await runCli(["deploy", "--preview", "--json"]);
    const { record } = lastJson(preview.stdout) as {
      record: { url: string; sha: string };
    };
    // Change the source afterwards: promote must ship the recorded artifact, not a new build.
    writeFileSync(
      join(root, "src", "lib.ts"),
      'export const hello = () => "changed";\n'
    );

    const promoted = await runCli(["promote", record.url, "--json"]);

    expect(promoted.exitCode).toBe(0);
    const calls = mock.requests.filter((r) => r.path.endsWith("/workers"));
    expect(calls).toHaveLength(2);
    const promoteCall = calls[1] as { body: { code: string; name: string } };
    expect(promoteCall.body).toMatchObject({ name: "app" });
    expect(promoteCall.body.code).not.toContain("changed");
    const prod = lastJson(promoted.stdout) as {
      target: string;
      sha: string;
      url: string;
    };
    expect(prod).toMatchObject({
      sha: record.sha,
      target: "prod",
      url: "https://api.test.frontal.dev/v1/workers/app",
    });
  });

  it("rollback re-deploys the previous production artifact", async () => {
    const mock = await mockApi([workersRoute]);
    await runCli(["deploy", "--prod", "--yes", "--json"]);
    const first = readCurrentDeploy(root, "dev", "prod");
    writeFileSync(
      join(root, "src", "lib.ts"),
      'export const hello = () => "v2";\n'
    );
    await runCli(["deploy", "--prod", "--yes", "--json"]);
    const second = readCurrentDeploy(root, "dev", "prod");
    expect(second?.sha).not.toBe(first?.sha);

    const rolled = await runCli(["rollback", "--json"]);

    expect(rolled.exitCode).toBe(0);
    expect((lastJson(rolled.stdout) as { sha: string }).sha).toBe(first?.sha);
    expect(readCurrentDeploy(root, "dev", "prod")?.sha).toBe(first?.sha);
    const last = mock.requests
      .filter((r) => r.path.endsWith("/workers"))
      .at(-1);
    expect(
      String((last as { body: { code: string } }).body.code)
    ).not.toContain("v2");
  });

  it("also rolls back agents listed in frontal.jsonc", async () => {
    const config = parseJsonc(
      readFileSync(join(root, "frontal.jsonc"), "utf-8")
    ) as Record<string, unknown>;
    writeFileSync(
      join(root, "frontal.jsonc"),
      JSON.stringify({ ...config, agents: ["agt_ok", "agt_missing"] })
    );
    const mock = await mockApi([
      workersRoute,
      {
        body: { id: "agt_ok", version: 3 },
        method: "POST",
        path: "/agents/agt_ok/rollback",
      },
      {
        body: { code: "NOT_FOUND", message: "no agent", requestId: "req_a" },
        method: "POST",
        path: "/agents/agt_missing/rollback",
        status: 404,
      },
    ]);
    await runCli(["deploy", "--prod", "--yes", "--json"]);
    await runCli(["deploy", "--prod", "--yes", "--json"]);

    const rolled = await runCli(["rollback", "--json"]);

    expect(rolled.exitCode).toBe(0);
    mock.expectCalled("POST", "/agents/agt_ok/rollback");
    expect((lastJson(rolled.stdout) as { agents: unknown[] }).agents).toEqual([
      { agentId: "agt_ok", version: 3 },
      { agentId: "agt_missing", error: "NOT_FOUND: no agent" },
    ]);
  });

  it("explains when there is nothing to roll back to or the artifact is gone", async () => {
    await mockApi([workersRoute]);
    const none = await runCli(["rollback", "--json"]);
    expect(none.exitCode).toBe(5);
    expect(lastJson(none.stderr).error).toMatchObject({
      code: "NO_ROLLBACK_TARGET",
    });

    const preview = await runCli(["deploy", "--preview", "--json"]);
    const { record } = lastJson(preview.stdout) as {
      record: { url: string; artifactDir: string };
    };
    rmSync(record.artifactDir, { force: true, recursive: true });
    const gone = await runCli(["promote", record.url, "--json"]);
    expect(gone.exitCode).toBe(5);
    expect(lastJson(gone.stderr).error).toMatchObject({
      code: "ARTIFACT_MISSING",
    });

    const unknown = await runCli(["promote", "https://nope", "--json"]);
    expect(lastJson(unknown.stderr).error).toMatchObject({
      code: "DEPLOYMENT_NOT_FOUND",
    });
  });

  it("runs the whole loop against frontal dev", async () => {
    mkdirSync(join(root, ".frontal"), { recursive: true });
    server = new DevServer({ globalOpts: {}, port: 0, root, watch: false });
    const info = await server.start();
    const flags = [
      "--api-key",
      TEST_API_KEY,
      "--api-url",
      `${info.url}/v1`,
      "--json",
    ];

    const preview = await runCli(["deploy", "--preview", ...flags]);
    expect(preview.exitCode).toBe(0);
    const {
      record: { url },
    } = lastJson(preview.stdout) as { record: { url: string } };
    expect(url).toBe(`${info.url}/v1/workers/app-preview`);
    expect((await fetch(url)).status).toBe(200);

    const promoted = await runCli(["promote", url, ...flags]);
    expect(promoted.exitCode).toBe(0);
    expect((await fetch(`${info.url}/v1/workers/app`)).status).toBe(200);

    const pushed = await runCli(["env", "push", ...flags]);
    expect(lastJson(pushed.stderr).error).toMatchObject({
      code: "ENV_FILE_MISSING",
    });
  });
});
