import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { run } from "@/cli.js";
import { runCli } from "./helpers/cli.js";

const HELP_BUDGET_MS = 500;

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
      const result = await runCli([...path, "--help"]);
      expect(result.exitCode, path.join(" ")).toBe(0);
      expect(result.stdout.join("\n"), path.join(" ")).toContain("Examples:");
    }
  }, 30_000);

  it("exports run()", () => {
    expect(typeof run).toBe("function");
  });
});
