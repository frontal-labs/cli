import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initProject, toProjectName } from "@/commands/init.js";
import { parseJsonc } from "@/lib/project.js";
import { lastJson, runCli } from "./helpers/cli.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-init-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("initProject", () => {
  it("creates the minimal project layout", () => {
    const result = initProject(root, { name: "my-app" });

    expect(result.dir).toBe(join(root, "my-app"));
    expect(result.created.sort()).toEqual(
      [
        ".env.example",
        ".gitignore",
        "frontal.jsonc",
        "package.json",
        "src/.gitkeep",
      ].sort()
    );
    const config = parseJsonc(
      readFileSync(join(result.dir, "frontal.jsonc"), "utf-8")
    );
    expect(config).toMatchObject({
      name: "my-app",
      env: "dev",
      apiUrl: "https://api.frontal.dev/v1",
      services: {
        ai: { remote: false },
        agents: { remote: false },
        graph: { remote: false },
      },
      secrets: { required: ["FRONTAL_API_KEY"] },
    });
    expect(readFileSync(join(result.dir, ".env.example"), "utf-8")).toContain(
      "FRONTAL_API_KEY=\n"
    );
    expect(readFileSync(join(result.dir, ".gitignore"), "utf-8")).toContain(
      ".frontal/\n.env\n.env.local"
    );
    expect(
      JSON.parse(readFileSync(join(result.dir, "package.json"), "utf-8"))
    ).toMatchObject({
      name: "my-app",
      dependencies: { "@frontal-labs/sdk": "^1.0.4" },
    });
  });

  it("never overwrites without --force and keeps package.json even with it", () => {
    initProject(root, { name: "app" });
    const dir = join(root, "app");
    writeFileSync(join(dir, "frontal.jsonc"), '{ "name": "custom" }');
    writeFileSync(join(dir, "package.json"), '{ "name": "mine" }');

    const second = initProject(root, { name: "app" });
    expect(second.created).toEqual([]);
    expect(second.skipped.sort()).toEqual([".env.example", "frontal.jsonc"]);
    expect(second.kept.sort()).toEqual([
      ".gitignore",
      "package.json",
      "src/.gitkeep",
    ]);
    expect(readFileSync(join(dir, "frontal.jsonc"), "utf-8")).toBe(
      '{ "name": "custom" }'
    );

    const forced = initProject(root, { name: "app", force: true });
    expect(forced.updated.sort()).toEqual([".env.example", "frontal.jsonc"]);
    expect(readFileSync(join(dir, "package.json"), "utf-8")).toBe(
      '{ "name": "mine" }'
    );
    expect(
      parseJsonc(readFileSync(join(dir, "frontal.jsonc"), "utf-8"))
    ).toMatchObject({
      name: "app",
    });
  });

  it("appends only the missing .gitignore entries", () => {
    const dir = join(root, "app");
    initProject(root, { name: "app" });
    writeFileSync(join(dir, ".gitignore"), "node_modules\n.env\n");

    const result = initProject(root, { name: "app" });
    expect(result.updated).toEqual([".gitignore"]);
    const content = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(content).toBe(
      "node_modules\n.env\n\n# Frontal\n.frontal/\n.env.local\n"
    );
  });

  it("uses the current directory when --name is omitted", () => {
    const result = initProject(root, {});
    expect(result.dir).toBe(root);
    expect(existsSync(join(root, "frontal.jsonc"))).toBe(true);
  });

  it("normalizes directory names into project names", () => {
    expect(toProjectName("My App!")).toBe("my-app");
    expect(toProjectName("___")).toBe("frontal-app");
  });
});

describe("frontal init (CLI)", () => {
  it("prints created files and next steps, and --json returns the result", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(root);

    const human = await runCli(["init", "--name", "demo"]);
    expect(human.exitCode).toBe(0);
    expect(human.stdout.join("\n")).toContain("frontal.jsonc");
    expect(human.stdout.join("\n")).toContain("cd demo");
    expect(human.stdout.join("\n")).toContain("frontal dev");

    const json = await runCli(["init", "--name", "demo", "--json"]);
    expect(json.exitCode).toBe(0);
    expect(lastJson(json.stdout)).toMatchObject({
      name: "demo",
      created: [],
      skipped: expect.arrayContaining(["frontal.jsonc"]),
    });
  });
});
