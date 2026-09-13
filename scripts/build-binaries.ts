#!/usr/bin/env bun
/**
 * Compiles single-file executables. Default: every supported platform into
 * dist/binaries/. `--current`: only the host platform, to dist/frontal.
 * The package.json version is injected as __FRONTAL_VERSION__.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64",
] as const;

const currentOnly = process.argv.includes("--current");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf-8")
) as { version: string };
const TARGET_PREFIX = /^bun-/;
const outDir = join(root, "dist", "binaries");
mkdirSync(outDir, { recursive: true });

const builds: { outfile: string; target?: string }[] = currentOnly
  ? [{ outfile: join(root, "dist", "frontal") }]
  : TARGETS.map((target) => ({
      outfile: join(outDir, `frontal-${target.replace(TARGET_PREFIX, "")}`),
      target,
    }));

for (const { target, outfile } of builds) {
  const proc = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      "--minify",
      "--define",
      `__FRONTAL_VERSION__=${JSON.stringify(version)}`,
      ...(target ? [`--target=${target}`] : []),
      "./bin/frontal.ts",
      `--outfile=${outfile}`,
    ],
    { cwd: root, stdio: "inherit" }
  );
  if (proc.status !== 0) {
    console.error(`build failed for ${target ?? "current platform"}`);
    process.exit(proc.status ?? 1);
  }
}
console.log(
  currentOnly
    ? "binary written to dist/frontal"
    : `binaries written to ${outDir}`
);
