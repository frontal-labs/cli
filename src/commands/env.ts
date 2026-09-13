import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { type CommandContext, runAction } from "@/lib/command.js";
import { loadProjectConfig, type ProjectConfig } from "@/lib/config.js";
import { type DeployRecord, readCurrentDeploy } from "@/lib/deploys.js";
import { withExamples } from "@/lib/output.js";
import { parseDotenv } from "@/lib/project.js";
import { resolveCredential } from "@/lib/sdk.js";
import { deployWorker } from "@/lib/workers.js";
import { registerSensitiveKeys } from "@/output/redact.js";
import { theme } from "@/output/theme.js";

export const DEFAULT_ENV_FILE = ".env.local";

/** Keys that are connection settings rather than project variables. */
const CONNECTION_KEYS = new Set(["FRONTAL_API_KEY", "FRONTAL_API_URL"]);
const NEEDS_QUOTES = /[\s#"']/;

export interface PullResult {
  file: string;
  /** Secrets that still have no value after the pull. */
  missing: string[];
  /** Keys taken from an existing file. */
  preserved: string[];
  /** Keys written from frontal.jsonc / credentials. */
  written: string[];
}

interface PullInput {
  config: ProjectConfig;
  /** Credential-derived defaults for secrets (never read from the target file). */
  defaults: Partial<Record<string, string>>;
  existing: Partial<Record<string, string>>;
}

function renderDotenv(
  entries: { comment?: string; key: string; value: string }[]
): string {
  const lines: string[] = [
    "# Managed by `frontal env pull` — secrets are never stored in frontal.jsonc.",
  ];
  for (const entry of entries) {
    if (entry.comment) {
      lines.push(`# ${entry.comment}`);
    }
    const needsQuotes = NEEDS_QUOTES.test(entry.value);
    lines.push(
      `${entry.key}=${needsQuotes ? JSON.stringify(entry.value) : entry.value}`
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Computes the merged `.env.local` content. Pure; no filesystem access. */
export function buildEnvFile(input: PullInput): {
  content: string;
  missing: string[];
  preserved: string[];
  written: string[];
} {
  const { config, existing, defaults } = input;
  const entries: { comment?: string; key: string; value: string }[] = [];
  const written: string[] = [];
  const preserved: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  const push = (
    key: string,
    value: string,
    source: "written" | "preserved",
    comment?: string
  ): void => {
    entries.push({ comment, key, value });
    seen.add(key);
    (source === "written" ? written : preserved).push(key);
  };

  push(
    "FRONTAL_API_URL",
    existing.FRONTAL_API_URL ?? config.apiUrl,
    existing.FRONTAL_API_URL ? "preserved" : "written",
    `API base URL (${config.env})`
  );

  for (const key of config.secrets.required) {
    const value = existing[key] ?? defaults[key];
    if (value) {
      push(
        key,
        value,
        existing[key] ? "preserved" : "written",
        "required secret"
      );
    } else {
      entries.push({ comment: "required secret — fill in", key, value: "" });
      seen.add(key);
      missing.push(key);
    }
  }

  for (const [key, value] of Object.entries(config.vars)) {
    if (!seen.has(key)) {
      push(key, value, "written");
    }
  }

  for (const [key, value] of Object.entries(existing)) {
    if (!seen.has(key) && value !== undefined) {
      push(key, value, "preserved");
    }
  }

  return { content: renderDotenv(entries), missing, preserved, written };
}

export async function pullEnv(
  ctx: CommandContext,
  options: { env?: string; file?: string; force?: boolean }
): Promise<PullResult> {
  const { config, root } = await loadProjectConfig({ env: options.env });
  registerSensitiveKeys(config.secrets.required);
  const file = resolve(root, options.file ?? DEFAULT_ENV_FILE);

  if (existsSync(file) && !options.force) {
    throw new CliError(
      "ENV_FILE_EXISTS",
      `${relative(process.cwd(), file) || file} already exists.`,
      {
        exitCode: EXIT_CODES.GENERAL_ERROR,
        fix: "Re-run with --force to merge into it (existing secret values are kept), or pass another file name.",
      }
    );
  }

  const existing = existsSync(file)
    ? parseDotenv(readFileSync(file, "utf-8"))
    : {};

  // Only credentials from flags, the shell or the profile may seed the file —
  // never values that came from the very file being written.
  const credential = resolveCredential(resolveConfig(ctx.globalOpts));
  const defaults: Record<string, string> = {};
  if (credential?.kind === "api-key") {
    defaults.FRONTAL_API_KEY = credential.apiKey;
  }

  const built = buildEnvFile({ config, defaults, existing });
  writeFileSync(file, built.content, { mode: 0o600 });
  return {
    file,
    missing: built.missing,
    preserved: built.preserved,
    written: built.written,
  };
}

export interface PushResult {
  deployment: string;
  keys: string[];
  requestId?: string;
}

/**
 * Uploads project variables to the current deployment. The platform has no
 * standalone secrets store in this SDK version, so variables travel with the
 * worker (`POST /workers` with `env_vars`); secret *values* are read from the
 * env file and forwarded but never printed.
 */
export async function pushEnv(
  ctx: CommandContext,
  options: { env?: string; file?: string }
): Promise<PushResult> {
  const { config, root } = await loadProjectConfig({ env: options.env });
  registerSensitiveKeys(config.secrets.required);
  const file = resolve(root, options.file ?? DEFAULT_ENV_FILE);
  if (!existsSync(file)) {
    throw new CliError(
      "ENV_FILE_MISSING",
      `${relative(process.cwd(), file) || file} not found.`,
      {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Run `frontal env pull` first, then fill in the required secrets.",
      }
    );
  }
  const values = parseDotenv(readFileSync(file, "utf-8"));

  const missing = config.secrets.required.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new CliError(
      "MISSING_SECRETS",
      `Missing required secrets: ${missing.join(", ")}.`,
      {
        exitCode: EXIT_CODES.VALIDATION_ERROR,
        fix: `Set ${missing.join(", ")} in ${relative(process.cwd(), file) || file}.`,
      }
    );
  }

  const deployment = readCurrentDeploy(root, config.env);
  if (!deployment) {
    throw new CliError(
      "NO_DEPLOYMENT",
      `No deployment recorded for environment "${config.env}".`,
      {
        exitCode: EXIT_CODES.CONFIG_ERROR,
        fix: "Run `frontal deploy --preview` (or --prod) first; env push updates that deployment's variables.",
      }
    );
  }

  const envVars: Record<string, string> = { ...config.vars };
  for (const [key, value] of Object.entries(values)) {
    if (!CONNECTION_KEYS.has(key)) {
      envVars[key] = value;
    }
  }

  const handle = await ctx.sdk();
  await handle.frontal.auth.account.getProfile();
  await deployWorker(handle, deployPayload(deployment, envVars));

  return {
    deployment: deployment.name,
    keys: Object.keys(envVars).sort(),
    requestId: handle.lastRequestId,
  };
}

function deployPayload(
  deployment: DeployRecord,
  envVars: Record<string, string>
) {
  return {
    code: readFileSync(
      join(deployment.artifactDir, deployment.entrypoint),
      "utf-8"
    ),
    entrypoint: deployment.entrypoint,
    envVars,
    name: deployment.name,
  };
}

export function registerEnvCommands(program: Command): void {
  const env = program
    .command("env")
    .description(
      "Sync variables between frontal.jsonc, .env.local and deployments"
    );

  withExamples(
    env
      .command("pull")
      .description(
        "Write .env.local from frontal.jsonc vars, required secrets and your credentials"
      )
      .argument("[file]", "Target file", DEFAULT_ENV_FILE)
      .option(
        "--force",
        "Merge into an existing file (existing values are kept)"
      )
      .action((file: string, opts: { force?: boolean }, cmd) =>
        runAction(cmd, async (ctx) => {
          const result = await pullEnv(ctx, {
            env: ctx.globalOpts.env,
            file,
            force: opts.force,
          });
          if (ctx.globalOpts.json) {
            ctx.fmt.raw(result);
            return;
          }
          const rel = relative(process.cwd(), result.file) || result.file;
          console.log(`${theme.success("write")}  ${rel}`);
          if (result.written.length > 0) {
            console.log(theme.dim(`  written:   ${result.written.join(", ")}`));
          }
          if (result.preserved.length > 0) {
            console.log(
              theme.dim(`  preserved: ${result.preserved.join(", ")}`)
            );
          }
          if (result.missing.length > 0) {
            console.log(
              theme.warn(`  fill in:   ${result.missing.join(", ")}`)
            );
          }
        })
      ),
    [
      "frontal env pull",
      "frontal env pull --env staging --force",
      "frontal env pull .env.staging",
    ]
  );

  withExamples(
    env
      .command("push")
      .description(
        "Upload project variables to the current deployment (values are never printed)"
      )
      .argument("[file]", "Source file", DEFAULT_ENV_FILE)
      .action((file: string, _opts, cmd) =>
        runAction(cmd, async (ctx) => {
          const result = await pushEnv(ctx, { env: ctx.globalOpts.env, file });
          if (ctx.globalOpts.json) {
            ctx.fmt.raw(result);
            return;
          }
          console.log(
            `${theme.success("pushed")}  ${result.keys.length} variable(s) to ${result.deployment}`
          );
          console.log(theme.dim(`  ${result.keys.join(", ")}`));
          if (result.requestId) {
            console.log(theme.dim(`  request id: ${result.requestId}`));
          }
        })
      ),
    ["frontal env push", "frontal env push --env prod --json"]
  );
}
