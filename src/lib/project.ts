import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_BASE_URL } from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";

export const PROJECT_STATE_DIR = ".frontal";
/** The file `frontal init` writes, relative to the project root. */
export const PROJECT_CONFIG_FILE = `${PROJECT_STATE_DIR}/config.jsonc`;
/**
 * Every accepted project config location, relative to the project root, in
 * precedence order. The first one that exists is the project config; any
 * others are ignored with a warning. `.frontal/` holds the config only when
 * one of its config files exists, so a `.frontal/` with just `state/` is not a
 * project root.
 */
export const PROJECT_CONFIG_CANDIDATES = [
  `${PROJECT_STATE_DIR}/config.jsonc`,
  `${PROJECT_STATE_DIR}/config.json`,
  "frontal.jsonc",
  "frontal.json",
] as const;
export const PROJECT_SCHEMA_URL = "https://frontal.dev/schemas/frontal.json";

export const ENV_NAMES = ["dev", "staging", "prod"] as const;
export type EnvName = (typeof ENV_NAMES)[number];

/** True when `value` is one of the supported environment names. */
export function isEnvName(value: string): value is EnvName {
  return ENV_NAMES.some((name) => name === value);
}

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

/** Config files present in `root`, in precedence order (relative paths). */
export function existingProjectConfigs(root: string): string[] {
  return PROJECT_CONFIG_CANDIDATES.filter((rel) => existsSync(join(root, rel)));
}

/**
 * The project config relative to `root`: the first existing candidate, or
 * undefined when none exists.
 */
export function projectConfigRelPath(root: string): string | undefined {
  return existingProjectConfigs(root)[0];
}

const STATE_CONFIG_FILE_NAME = /^config(\.[a-z]+)?\.jsonc?$/;
const ROOT_CONFIG_FILE_NAME = /^frontal(\.[a-z]+)?\.jsonc?$/;

/** Whether a bare file name is one of the project config files (for watchers). */
export function isProjectConfigFileName(
  name: string,
  inStateDir: boolean
): boolean {
  return inStateDir
    ? STATE_CONFIG_FILE_NAME.test(name)
    : ROOT_CONFIG_FILE_NAME.test(name);
}

/**
 * Env overlay candidates (relative to root), in lookup order: the `.frontal/`
 * forms first, then the root `frontal.<env>` forms. The same order applies
 * whichever base config was found.
 */
export function envOverlayCandidates(env: string): string[] {
  return [
    `${PROJECT_STATE_DIR}/config.${env}.jsonc`,
    `${PROJECT_STATE_DIR}/config.${env}.json`,
    `frontal.${env}.jsonc`,
    `frontal.${env}.json`,
  ];
}

/** The first existing env overlay for `env`, relative to root. */
export function findEnvOverlayRelPath(
  root: string,
  env: string
): string | undefined {
  return envOverlayCandidates(env).find((rel) => existsSync(join(root, rel)));
}

/** Walks up from `start` until a project config is found. */
export function findProjectRoot(start = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (projectConfigRelPath(dir) !== undefined) {
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
  env: EnvName | undefined;
  files: string[];
  raw: Record<string, unknown>;
  root: string;
  /** Problems that do not stop loading, e.g. ignored extra config files. */
  warnings: string[];
}

export interface LoadProjectOptions {
  cwd?: string;
  /** Environment overlay to apply (`.frontal/config.<env>.jsonc`). */
  env?: string | undefined;
}

/**
 * Reads and merges the project config (+ its env overlay) without
 * validating. Used by the SDK factory, which must stay SDK-import free.
 */
export function loadRawProjectConfig(
  options: LoadProjectOptions = {}
): RawProject {
  const root = findProjectRoot(options.cwd);
  if (!root) {
    throw new CliError(
      "NO_PROJECT",
      `No project config (${PROJECT_CONFIG_CANDIDATES.join(", ")}) found in ${resolve(options.cwd ?? process.cwd())} or its parents.`,
      {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: `Run \`frontal init\` to create ${PROJECT_CONFIG_FILE}, or cd into a project.`,
      }
    );
  }

  const [baseRel, ...ignored] = existingProjectConfigs(root);
  if (baseRel === undefined) {
    throw new CliError("NO_PROJECT", `No project config found in ${root}.`, {
      exitCode: EXIT_CODES.CONFIG_ERROR,
    });
  }
  const warnings =
    ignored.length > 0
      ? [
          `Using ${baseRel}; ignoring ${ignored.join(", ")}. Keep one project config and remove the others.`,
        ]
      : [];
  const baseFile = join(root, baseRel);
  const files = [baseFile];
  let raw = readConfigFile(baseFile);

  const env = options.env ?? declaredEnvironment(raw);
  if (env !== undefined) {
    if (!isEnvName(env)) {
      throw new CliError("CONFIG_INVALID", `Unknown environment "${env}".`, {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: `Use one of: ${ENV_NAMES.join(", ")}.`,
      });
    }
    const overlayRel = findEnvOverlayRelPath(root, env);
    if (overlayRel !== undefined) {
      const overlay = join(root, overlayRel);
      files.push(overlay);
      raw = deepMerge(raw, readConfigFile(overlay));
    }
    raw = { ...raw, env };
  }

  return { env, files, raw, root, warnings };
}

/**
 * The `env` key of a raw config as text. A non-string value is kept as its text
 * so the "Unknown environment" error still names it.
 */
function declaredEnvironment(raw: Record<string, unknown>): string | undefined {
  const { env: value } = raw;
  return value === undefined ? undefined : String(value);
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
    const [, key] = match;
    if (key === undefined) {
      continue;
    }
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

/** Builds the minimal `.frontal/config.jsonc` document written by `frontal init`. */
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
