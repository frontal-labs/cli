import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { ProjectState, STATE_NAMESPACES } from "@/lib/state.js";

export const BUNDLE_FILE = "index.js";
export const MANIFEST_FILE = "manifest.json";

export interface BundleResult {
  code: string;
  entry: string;
  file: string;
  outdir: string;
  sha: string;
  size: number;
}

interface BunBuildOutput {
  logs: { message: string }[];
  outputs: { text: () => Promise<string> }[];
  success: boolean;
}

interface BunGlobal {
  build: (options: {
    entrypoints: string[];
    format: "esm";
    minify: boolean;
    target: "bun";
  }) => Promise<BunBuildOutput>;
}

function bunRuntime(): BunGlobal | undefined {
  const candidate = (globalThis as { Bun?: unknown }).Bun;
  return candidate && typeof (candidate as BunGlobal).build === "function"
    ? (candidate as BunGlobal)
    : undefined;
}

function buildError(detail: string): CliError {
  return new CliError(
    "BUNDLE_FAILED",
    `Could not bundle the entry file: ${detail}`,
    {
      exitCode: EXIT_CODES.GENERAL_ERROR,
      fix: "Fix the build errors above, or check `entry` in frontal.jsonc.",
    }
  );
}

/** Bundles with the in-process Bun runtime, or the `bun` CLI under Node. */
async function bundleEntry(entryFile: string, root: string): Promise<string> {
  const bun = bunRuntime();
  if (bun) {
    const result = await bun.build({
      entrypoints: [entryFile],
      format: "esm",
      minify: false,
      target: "bun",
    });
    if (!result.success || result.outputs.length === 0) {
      throw buildError(
        result.logs.map((log) => log.message).join("\n") || "unknown error"
      );
    }
    return await (result.outputs[0] as { text: () => Promise<string> }).text();
  }

  const proc = spawnSync(
    "bun",
    ["build", "--format=esm", "--target=bun", entryFile],
    { cwd: root, encoding: "utf-8" }
  );
  if (proc.error && (proc.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new CliError(
      "BUNDLER_UNAVAILABLE",
      "Bundling needs the Bun runtime.",
      {
        exitCode: EXIT_CODES.GENERAL_ERROR,
        fix: "Install Bun (https://bun.sh) or run the compiled `frontal` binary; `bun build` is used to bundle the entry file.",
      }
    );
  }
  if (proc.status !== 0) {
    throw buildError(
      proc.stderr.trim() ||
        proc.stdout.trim() ||
        `bun build exited ${proc.status}`
    );
  }
  return proc.stdout;
}

/**
 * Bundles the project's entry file into a single ESM artifact in `outdir`
 * and returns its content and content hash.
 */
export async function bundleProject(options: {
  entry: string;
  outdir: string;
  root: string;
}): Promise<BundleResult> {
  const entryFile = resolve(options.root, options.entry);
  if (!existsSync(entryFile)) {
    throw new CliError(
      "ENTRY_NOT_FOUND",
      `Entry file not found: ${options.entry}`,
      {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Create the file or set `entry` in frontal.jsonc to your app's entry point.",
      }
    );
  }
  const code = await bundleEntry(entryFile, options.root);
  const outdir = resolve(options.root, options.outdir);
  mkdirSync(outdir, { recursive: true });
  const file = join(outdir, BUNDLE_FILE);
  writeFileSync(file, code);
  return {
    code,
    entry: options.entry,
    file,
    outdir,
    sha: createHash("sha256").update(code).digest("hex"),
    size: Buffer.byteLength(code),
  };
}

export interface StateSchemaSnapshot {
  [namespace: string]: { fields: string[]; records: number };
}

/**
 * Describes the local state's shape (namespaces, record counts, field
 * names) without any row data, so previews never carry local records.
 */
export function snapshotStateSchema(root: string): StateSchemaSnapshot {
  const state = new ProjectState(root);
  const snapshot: StateSchemaSnapshot = {};
  for (const namespace of STATE_NAMESPACES) {
    const records = state.list<Record<string, unknown>>(namespace);
    if (records.length === 0) {
      continue;
    }
    const fields = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record)) {
        fields.add(key);
      }
    }
    snapshot[namespace] = {
      fields: [...fields].sort(),
      records: records.length,
    };
  }
  return snapshot;
}

export interface DeployManifest {
  createdAt: string;
  entry: string;
  env: string;
  name: string;
  sha: string;
  size: number;
  stateSchema: StateSchemaSnapshot;
  target: string;
  vars: string[];
}

export function writeManifest(
  outdir: string,
  manifest: DeployManifest
): string {
  const file = join(outdir, MANIFEST_FILE);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

export function readBundle(outdir: string): string {
  return readFileSync(join(outdir, BUNDLE_FILE), "utf-8");
}
