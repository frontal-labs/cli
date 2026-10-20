#!/usr/bin/env bun
/**
 * Compiles single-file executables. Default: the generic `cli` executable
 * plus every supported release target into dist/binaries/.
 * `--current`: only the host platform, to dist/cli.
 * The package.json version is injected as __FRONTAL_VERSION__.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = [
  { bunTarget: "bun-darwin-arm64", releaseName: "cli-aarch64-apple-darwin" },
  {
    bunTarget: "bun-linux-arm64",
    releaseName: "cli-aarch64-unknown-linux-gnu",
  },
  {
    bunTarget: "bun-windows-x64",
    releaseName: "cli-x86_64-pc-windows-msvc",
  },
  { bunTarget: "bun-darwin-x64", releaseName: "cli-x86_64-apple-darwin" },
  {
    bunTarget: "bun-linux-x64",
    releaseName: "cli-x86_64-unknown-linux-gnu",
  },
] as const;

const currentOnly = process.argv.includes("--current");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf-8")
) as { version: string };
const outDir = join(root, "dist", "binaries");
mkdirSync(outDir, { recursive: true });

const builds: { outfile: string; target?: string }[] = currentOnly
  ? [{ outfile: join(root, "dist", "cli") }]
  : [
      { outfile: join(outDir, "cli") },
      ...TARGETS.map(({ bunTarget, releaseName }) => ({
        outfile: join(outDir, releaseName),
        target: bunTarget,
      })),
    ];

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
  if (target === "bun-windows-x64" && existsSync(`${outfile}.exe`)) {
    renameSync(`${outfile}.exe`, outfile);
  }
}
console.log(
  currentOnly ? "binary written to dist/cli" : `binaries written to ${outDir}`
);
