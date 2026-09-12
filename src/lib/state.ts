import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { PROJECT_STATE_DIR } from "@/lib/project.js";

export const STATE_NAMESPACES = [
  "agents",
  "runs",
  "graph",
  "datasets",
  "blob",
  "policies",
  "workers",
  "deploys",
] as const;
export type StateNamespace = (typeof STATE_NAMESPACES)[number];

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * JSON-per-record store under `.frontal/state/<namespace>/<id>.json`.
 * Backs the local `frontal dev` server and deployment records.
 */
export class ProjectState {
  readonly baseDir: string;

  constructor(root: string, baseDir = join(PROJECT_STATE_DIR, "state")) {
    this.baseDir = join(root, baseDir);
  }

  dir(namespace: StateNamespace): string {
    return join(this.baseDir, namespace);
  }

  private file(namespace: StateNamespace, id: string): string {
    if (!SAFE_ID.test(id)) {
      throw new CliError("INVALID_STATE_ID", `Invalid state id "${id}".`, {
        exitCode: EXIT_CODES.VALIDATION_ERROR,
        fix: "Ids may only contain letters, digits, dots, dashes and underscores.",
      });
    }
    return join(this.dir(namespace), `${id}.json`);
  }

  read<T>(namespace: StateNamespace, id: string): T | undefined {
    const file = this.file(namespace, id);
    if (!existsSync(file)) {
      return;
    }
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  }

  write(namespace: StateNamespace, id: string, value: unknown): void {
    const file = this.file(namespace, id);
    mkdirSync(this.dir(namespace), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  list<T>(namespace: StateNamespace): T[] {
    const dir = this.dir(namespace);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => JSON.parse(readFileSync(join(dir, name), "utf-8")) as T);
  }

  ids(namespace: StateNamespace): string[] {
    const dir = this.dir(namespace);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .sort();
  }

  remove(namespace: StateNamespace, id: string): boolean {
    const file = this.file(namespace, id);
    if (!existsSync(file)) {
      return false;
    }
    rmSync(file);
    return true;
  }

  clear(namespace?: StateNamespace): void {
    const target = namespace ? this.dir(namespace) : this.baseDir;
    rmSync(target, { force: true, recursive: true });
  }
}

/** Scenario route shape — mirrors `MockRoute` from `@frontal-labs/testing`. */
export const scenarioRouteSchema = z
  .object({
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    method: z.string().min(1),
    /** Path suffix to match, or a regular expression when it starts with `^`. */
    path: z.string().min(1),
    status: z.number().int().min(100).max(599).optional(),
    /** Number of times this route may match before it is skipped. */
    times: z.number().int().positive().optional(),
  })
  .strict();

export const scenarioSchema = z
  .object({
    description: z.string().optional(),
    name: z.string().optional(),
    routes: z.array(scenarioRouteSchema),
  })
  .strict();

export type ScenarioRoute = z.output<typeof scenarioRouteSchema>;
export type Scenario = z.output<typeof scenarioSchema>;

export function scenarioPath(root: string, name: string): string {
  return join(root, PROJECT_STATE_DIR, "scenarios", `${name}.json`);
}

/** Loads and validates `.frontal/scenarios/<name>.json`. */
export function loadScenario(root: string, name: string): Scenario {
  if (!SAFE_ID.test(name)) {
    throw new CliError("INVALID_SCENARIO", `Invalid scenario name "${name}".`, {
      exitCode: EXIT_CODES.VALIDATION_ERROR,
      fix: "Scenario names may only contain letters, digits, dots, dashes and underscores.",
    });
  }
  const file = scenarioPath(root, name);
  if (!existsSync(file)) {
    throw new CliError("SCENARIO_NOT_FOUND", `Scenario not found: ${file}`, {
      exitCode: EXIT_CODES.NOT_FOUND,
      fix: `Create ${file} with { "routes": [{ "method": "GET", "path": "/agents", "body": {...} }] }.`,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch (err) {
    // biome-ignore lint/style/useErrorCause: cause is forwarded through CliError options
    throw new CliError(
      "SCENARIO_INVALID",
      `Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err, exitCode: EXIT_CODES.CONFIG_ERROR }
    );
  }
  const result = scenarioSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError(
      "SCENARIO_INVALID",
      `Invalid scenario ${file}:\n${result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n")}`,
      {
        cause: result.error,
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Each route needs { method, path } and optional status/body/headers/times.",
      }
    );
  }
  return result.data;
}
