#!/usr/bin/env bun
/**
 * Executes the ```bash fences in README.md so documented commands stay
 * truthful. Add `skip` after the language (```bash skip) for blocks that
 * need external state (a real API key, a deployed app, an interactive TTY).
 *
 * Usage: bun scripts/run-readme-blocks.ts [README.md] [--dry-run]
 *
 * Blocks run in a scratch project created by `frontal init`, with the CLI
 * from ./dist on PATH, FRONTAL_CONFIG_DIR isolated from ~/.frontal, and a
 * `frontal dev` server on FRONTAL_API_URL so API examples work offline.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const readme = resolve(args.find((a) => !a.startsWith("--")) ?? "README.md");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FENCE = /^```bash(?<flags>[^\n]*)\n(?<body>[\s\S]*?)^```/gm;
const WHITESPACE = /\s+/;

interface Block {
  body: string;
  line: number;
  skip: boolean;
}

function extractBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const match of markdown.matchAll(FENCE)) {
    const flags = (match.groups?.flags ?? "").trim().split(WHITESPACE);
    const body = match.groups?.body ?? "";
    const line = markdown.slice(0, match.index).split("\n").length;
    blocks.push({ body, line, skip: flags.includes("skip") });
  }
  return blocks;
}

const blocks = extractBlocks(readFileSync(readme, "utf-8"));
const runnable = blocks.filter((b) => !b.skip);
console.log(
  `README: ${blocks.length} bash blocks, ${runnable.length} runnable, ${blocks.length - runnable.length} skipped`
);
if (dryRun) {
  for (const block of runnable) {
    console.log(`--- line ${block.line} ---\n${block.body}`);
  }
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), "frontal-readme-"));
const binDir = join(work, "bin");
mkdirSync(binDir);
symlinkSync(join(repoRoot, "dist", "index.js"), join(binDir, "frontal"));

const DEV_PORT = 8787;
const env = {
  ...process.env,
  PATH: `${binDir}:${process.env.PATH ?? ""}`,
  FRONTAL_CONFIG_DIR: join(work, "config"),
  FRONTAL_API_KEY: process.env.FRONTAL_API_KEY ?? "frt_readme_example_key_000",
  FRONTAL_API_URL:
    process.env.FRONTAL_API_URL ?? `http://127.0.0.1:${DEV_PORT}/v1`,
  NO_COLOR: "1",
  CI: "1",
};

let failed = 0;
const cwd = join(work, "project");
mkdirSync(cwd);

// Boot a local API for the examples unless the caller points at a real one.
let devServer: ChildProcess | undefined;
if (!process.env.FRONTAL_API_URL) {
  const init = spawnSync("frontal", ["init", "--name", "readme-app"], {
    cwd,
    env,
    encoding: "utf-8",
  });
  if (init.status !== 0) {
    console.error(init.stdout, init.stderr);
    process.exit(1);
  }
  devServer = spawn(
    "frontal",
    ["dev", "--port", String(DEV_PORT), "--no-watch"],
    {
      cwd: join(cwd, "readme-app"),
      env,
      stdio: "ignore",
    }
  );
  const healthy = await waitForHealth(
    `http://127.0.0.1:${DEV_PORT}/health`,
    10_000
  );
  if (!healthy) {
    console.error("frontal dev did not become healthy");
    devServer.kill();
    process.exit(1);
  }
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

for (const block of runnable) {
  const script = `set -euo pipefail\n${block.body}`;
  const proc = spawnSync("bash", ["-c", script], {
    cwd,
    env,
    encoding: "utf-8",
  });
  const ok = proc.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} README.md:${block.line}`);
  if (!ok) {
    failed += 1;
    console.log(block.body.trim());
    console.log(proc.stdout);
    console.log(proc.stderr);
  }
}

devServer?.kill();
rmSync(work, { recursive: true, force: true });
if (failed > 0) {
  console.error(`${failed} README block(s) failed`);
  process.exit(1);
}
