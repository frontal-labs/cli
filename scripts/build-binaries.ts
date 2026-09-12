#!/usr/bin/env bun
/**
 * Cross-compiles single-file executables for every supported platform into
 * dist/binaries/. Run after `bun run build`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64",
] as const;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_PREFIX = /^bun-/;
const outDir = join(root, "dist", "binaries");
mkdirSync(outDir, { recursive: true });

for (const target of TARGETS) {
  const name = `frontal-${target.replace(TARGET_PREFIX, "")}`;
  const proc = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      "--minify",
      `--target=${target}`,
      "./bin/frontal.ts",
      `--outfile=${join(outDir, name)}`,
    ],
    { cwd: root, stdio: "inherit" }
  );
  if (proc.status !== 0) {
    console.error(`build failed for ${target}`);
    process.exit(proc.status ?? 1);
  }
}
console.log(`binaries written to ${outDir}`);
