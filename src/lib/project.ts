import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_BASE_URL } from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";

export const PROJECT_CONFIG_FILE = "frontal.jsonc";
export const PROJECT_SCHEMA_URL = "https://frontal.dev/schemas/frontal.jsonc";
export const PROJECT_STATE_DIR = ".frontal";

export const ENV_NAMES = ["dev", "staging", "prod"] as const;
export type EnvName = (typeof ENV_NAMES)[number];

/** Every service namespace exposed by `new Frontal()`. */
export const SERVICE_KEYS = [
  "agents",
  "ai",
  "audit",
  "auth",
  "billing",
  "blob",
  "connectors",
  "data",
  "datasets",
  "events",
  "governance",
  "graph",
  "integrations",
  "lineage",
  "observability",
  "ontology",
  "pipelines",
  "sandbox",
  "schedules",
  "webhooks",
  "workers",
  "workflows",
] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

/** Services `frontal init` enables by default. */
export const DEFAULT_SERVICES: ServiceKey[] = ["ai", "agents", "graph"];

const LINE_COMMENT = /\/\/[^\n\r]*/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const TRAILING_COMMA = /,(\s*[}\]])/g;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;
const PLACEHOLDER = /\uE000(\d+)\uE000/g;

/**
 * Parses JSON with comments and trailing commas. Comment markers inside
 * string literals are preserved.
 */
export function parseJsonc(text: string): unknown {
  const strings: string[] = [];
  const withPlaceholders = text.replace(STRING_LITERAL, (match) => {
    strings.push(match);
    return `\uE000${strings.length - 1}\uE000`;
  });
  const stripped = withPlaceholders
    .replace(BLOCK_COMMENT, "")
    .replace(LINE_COMMENT, "")
    .replace(TRAILING_COMMA, "$1");
  const restored = stripped.replace(
    PLACEHOLDER,
    (_, index: string) => strings[Number(index)] ?? ""
  );
  return JSON.parse(restored);
}

/** Walks up from `start` until a `frontal.jsonc` is found. */
export function findProjectRoot(start = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, PROJECT_CONFIG_FILE))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return;
    }
    dir = parent;
  }
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

export function readConfigFile(file: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parseJsonc(readFileSync(file, "utf-8"));
  } catch (err) {
    // biome-ignore lint/style/useErrorCause: cause is forwarded through CliError options
    throw new CliError(
      "CONFIG_PARSE_ERROR",
      `Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Check the file for JSON syntax errors (comments and trailing commas are allowed).",
      }
    );
  }
  if (!isPlainObject(parsed)) {
    throw new CliError(
      "CONFIG_PARSE_ERROR",
      `${file} must contain a JSON object.`,
      { exitCode: EXIT_CODES.CONFIG_ERROR }
    );
  }
  return parsed;
}

export interface RawProject {
  env?: EnvName;
  files: string[];
  raw: Record<string, unknown>;
  root: string;
}

export interface LoadProjectOptions {
  cwd?: string;
  /** Environment overlay to apply (`frontal.<env>.jsonc`). */
  env?: string;
}

/**
 * Reads and merges `frontal.jsonc` (+ `frontal.<env>.jsonc`) without
 * validating. Used by the SDK factory, which must stay SDK-import free.
 */
export function loadRawProjectConfig(
  options: LoadProjectOptions = {}
): RawProject {
  const root = findProjectRoot(options.cwd);
  if (!root) {
    throw new CliError(
      "NO_PROJECT",
      `No ${PROJECT_CONFIG_FILE} found in ${resolve(options.cwd ?? process.cwd())} or its parents.`,
      {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Run `frontal init` to create a project, or cd into one.",
      }
    );
  }

  const baseFile = join(root, PROJECT_CONFIG_FILE);
  const files = [baseFile];
  let raw = readConfigFile(baseFile);

  const env = options.env ?? (raw.env as string | undefined);
  if (env !== undefined) {
    if (!ENV_NAMES.includes(env as EnvName)) {
      throw new CliError("CONFIG_INVALID", `Unknown environment "${env}".`, {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: `Use one of: ${ENV_NAMES.join(", ")}.`,
      });
    }
    const overlay = join(root, `frontal.${env}.jsonc`);
    if (existsSync(overlay)) {
      files.push(overlay);
      raw = deepMerge(raw, readConfigFile(overlay));
    }
    raw.env = env;
  }

  return { env: env as EnvName | undefined, files, raw, root };
}

const NEWLINE = /\r?\n/;
const DOTENV_LINE =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/;

/** Parses a dotenv file without mutating `process.env`. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(NEWLINE)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const match = DOTENV_LINE.exec(line);
    if (!match) {
      continue;
    }
    const key = match[1] as string;
    let value = (match[2] ?? "").trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) {
        value = value.slice(0, hash).trim();
      }
    }
    out[key] = value;
  }
  return out;
}

/** Reads `<root>/.env.local` if present. */
export function loadDotenvLocal(root: string): Record<string, string> {
  const file = join(root, ".env.local");
  if (!existsSync(file)) {
    return {};
  }
  return parseDotenv(readFileSync(file, "utf-8"));
}

/** Builds the minimal `frontal.jsonc` document written by `frontal init`. */
export function renderProjectConfig(name: string): string {
  const services = DEFAULT_SERVICES.map(
    (key) => `    "${key}": { "remote": false }`
  ).join(",\n");
  return `{
  // Frontal project configuration. Schema: ${PROJECT_SCHEMA_URL}
  "$schema": "${PROJECT_SCHEMA_URL}",
  "name": "${name}",
  // dev | staging | prod — override per command with --env
  "env": "dev",
  "apiUrl": "${DEFAULT_BASE_URL}",
  // Services used by this project. "remote": true proxies to the API in \`frontal dev\`.
  "services": {
${services}
  },
  // Plain configuration values, written to .env.local by \`frontal env pull\`.
  "vars": {},
  // Secrets that must be present in the environment (never stored here).
  "secrets": { "required": ["FRONTAL_API_KEY"] }
}
`;
}
