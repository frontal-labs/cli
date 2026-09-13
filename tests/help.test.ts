import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { run } from "@/cli.js";
import { lastJson, runCli } from "./helpers/cli.js";

const HELP_BUDGET_MS = 500;
const VERSION_LINE = /Frontal CLI v\d+\.\d+\.\d+/;
const RUNTIME_LINE = /\((bun|node) v?\d/;
const VERSION_PREFIX = /Frontal CLI v\d/;
const RUNTIME_NAME = /^(bun|node)$/;

function collectCommands(cmd: Command, prefix: string[] = []): string[][] {
  const out: string[][] = [];
  for (const sub of cmd.commands) {
    const path = [...prefix, sub.name()];
    if (sub.commands.length > 0) {
      out.push(...collectCommands(sub, path));
    } else if (sub.name() !== "help" && !sub.name().startsWith("__")) {
      out.push(path);
    }
  }
  return out;
}

describe("--help", () => {
  it("renders the top-level help under the startup budget", async () => {
    const started = performance.now();
    const result = await runCli(["--help"]);
    const elapsed = performance.now() - started;

    // commander prints help to stdout and exits 0
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("init");
    expect(elapsed).toBeLessThan(HELP_BUDGET_MS);
  });

  it("every leaf command documents at least one example", async () => {
    const program = new Command();
    // Build the tree without executing anything.
    const { buildProgram } = await import("@/cli.js");
    buildProgram(program);
    const leaves = collectCommands(program);
    expect(leaves.length).toBeGreaterThan(20);

    for (const path of leaves) {
      // biome-ignore lint/performance/noAwaitInLoops: runCli shares process state
      const result = await runCli([...path, "--help"]);
      expect(result.exitCode, path.join(" ")).toBe(0);
      expect(result.stdout.join("\n"), path.join(" ")).toContain("Examples:");
    }
  }, 30_000);

  it("groups commands and shows version, runtime, usage and examples", async () => {
    const result = await runCli(["--help"]);
    const out = result.stdout.join("\n");
    for (const section of [
      "Usage",
      "Project",
      "Deploy",
      "Operate",
      "Platform API",
      "Account",
      "Shell",
      "Global options",
      "Examples",
      "Docs",
    ]) {
      expect(out, section).toContain(section);
    }
    expect(out).toContain("frontal [options] <command> [subcommand] [args]");
    expect(out).toMatch(VERSION_LINE);
    expect(out).toMatch(RUNTIME_LINE);
  });

  it("subcommand help carries a banner and a global-options pointer", async () => {
    const result = await runCli(["dev", "--help"]);
    const out = result.stdout.join("\n");
    expect(out).toContain("frontal dev");
    expect(out).toContain("Examples:");
    expect(out).toContain("frontal --help");
  });

  it("version command reports the runtime", async () => {
    const human = await runCli(["version"]);
    expect(human.stdout.join("\n")).toMatch(VERSION_PREFIX);
    const json = await runCli(["version", "--json"]);
    expect(lastJson(json.stdout)).toMatchObject({
      arch: process.arch,
      platform: process.platform,
      runtime: expect.stringMatching(RUNTIME_NAME),
    });
  });

  it("exports run()", () => {
    expect(typeof run).toBe("function");
  });
});
