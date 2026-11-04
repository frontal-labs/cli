#!/usr/bin/env bun
/**
 * Runs `tsc -p tsconfig.strict.json` and fails on any error in the files this
 * branch owns. Errors in shared files that the owned code imports (auth,
 * config resolution, error handling, the command wrapper) are reported as a
 * count, not failed, so the gate stays honest without rewriting shared code.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");
const OWNED_PREFIXES = [
  "src/lib/ontology/",
  "src/commands/sync.ts",
  "src/lib/project.ts",
  "src/lib/config.ts",
];
const ERROR_LINE = /^(?<file>[^(\s]+)\((?<line>\d+),(?<col>\d+)\): error TS/;

const result = spawnSync(TSC, ["-p", "tsconfig.strict.json", "--noEmit"], {
  cwd: ROOT,
  encoding: "utf-8",
});
const lines = `${result.stdout}${result.stderr}`
  .split("\n")
  .filter((line) => ERROR_LINE.test(line));

const owned = lines.filter((line) => {
  const file = ERROR_LINE.exec(line)?.groups?.file ?? "";
  return OWNED_PREFIXES.some((prefix) => file.startsWith(prefix));
});

for (const line of owned) {
  console.error(line);
}
console.log(
  `strict: ${owned.length} error(s) in owned files; ${lines.length - owned.length} in shared files (reported, not failed)`
);
process.exit(owned.length > 0 ? 1 : 0);
