import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterAll, expect, it } from "vitest";
import { generateZshCompletions } from "@/completions/zsh.js";

const HOSTILE_DESCRIPTION = "x'$(touch /tmp/pwned)`id`\\ a:b\nrm -rf ~ 'y";

const tmpRoot = mkdtempSync(join(tmpdir(), "frontal-zsh-completions-"));

afterAll(() => {
  rmSync(tmpRoot, { force: true, recursive: true });
});

function buildProgram(): Command {
  const program = new Command("frontal");
  program.command("deploy").description("Deploy things");
  const env = program.command("env").description(HOSTILE_DESCRIPTION);
  env.command("pull").description("Pull env vars");
  env.command("push").description(HOSTILE_DESCRIPTION);
  return program;
}

it("keeps hostile descriptions inside their quoted entries", () => {
  const script = generateZshCompletions(buildProgram());

  // Every description must stay on one line so it cannot break out of quoting.
  expect(script).not.toContain("\nrm -rf ~");
  expect(script).toContain(
    "env:x'\\''$(touch /tmp/pwned)`id`\\\\ a\\:b rm -rf ~ '\\''y'"
  );
});

it("produces a script zsh can parse", () => {
  const script = generateZshCompletions(buildProgram());
  const file = join(tmpRoot, "_frontal");
  writeFileSync(file, script);

  expect(() =>
    execFileSync("zsh", ["-n", file], { stdio: "pipe" })
  ).not.toThrow();
});
