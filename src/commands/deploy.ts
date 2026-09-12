import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Command } from "commander";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { classifyError } from "@/errors/handler.js";
import {
  bundleProject,
  type DeployManifest,
  readBundle,
  snapshotStateSchema,
  writeManifest,
} from "@/lib/bundle.js";
import { type CommandContext, runAction } from "@/lib/command.js";
import { loadProjectConfig, type ProjectConfig } from "@/lib/config.js";
import {
  type DeployRecord,
  type DeployTarget,
  findDeploy,
  listDeploys,
  readCurrentDeploy,
  writeCurrentDeploy,
} from "@/lib/deploys.js";
import { withExamples } from "@/lib/output.js";
import { PROJECT_STATE_DIR } from "@/lib/project.js";
import type { SdkHandle } from "@/lib/sdk.js";
import { deployWorker } from "@/lib/workers.js";
import { theme } from "@/output/theme.js";
import { confirmAction, isInteractive } from "@/utils/interactive.js";

export interface DeployOptions {
  dryRun?: boolean;
  outdir?: string;
  preview?: boolean;
  prod?: boolean;
  yes?: boolean;
}

export const BUNDLE_ENTRYPOINT = "index.js";
const TRAILING_SLASHES = /\/+$/;

export function workerName(projectName: string, target: DeployTarget): string {
  return target === "prod" ? projectName : `${projectName}-preview`;
}

/** URL convention: `<apiUrl>/workers/<name>` (the SDK's invoke path). */
export function workerUrl(baseUrl: string, name: string): string {
  return `${baseUrl.replace(TRAILING_SLASHES, "")}/workers/${name}`;
}

function defaultOutdir(target: DeployTarget): string {
  return join(PROJECT_STATE_DIR, "build", target);
}

async function confirmProd(
  ctx: CommandContext,
  config: ProjectConfig,
  yes: boolean
): Promise<void> {
  if (yes || ctx.globalOpts.yes) {
    return;
  }
  if (!isInteractive()) {
    throw new CliError(
      "CONFIRMATION_REQUIRED",
      "Production deploys need confirmation.",
      {
        exitCode: EXIT_CODES.GENERAL_ERROR,
        fix: "Re-run with --yes to confirm non-interactively.",
      }
    );
  }
  const ok = await confirmAction(
    `Deploy ${config.name} to production (${workerName(config.name, "prod")})?`
  );
  if (!ok) {
    throw new CliError("DEPLOY_CANCELLED", "Deploy cancelled.", {
      exitCode: EXIT_CODES.GENERAL_ERROR,
    });
  }
}

/** Uploads an artifact under `name` and records the deployment. */
async function publish(
  handle: SdkHandle,
  root: string,
  config: ProjectConfig,
  input: { artifactDir: string; sha: string; target: DeployTarget }
): Promise<DeployRecord> {
  const name = workerName(config.name, input.target);
  const code = readBundle(input.artifactDir);
  const worker = await deployWorker(handle, {
    code,
    entrypoint: BUNDLE_ENTRYPOINT,
    envVars: config.vars,
    name,
  });
  // Keep an immutable copy per content hash so promote/rollback can re-send
  // exactly what was deployed even after later builds overwrite the outdir.
  const artifactDir = join(root, PROJECT_STATE_DIR, "artifacts", input.sha);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, BUNDLE_ENTRYPOINT), code);
  const record: DeployRecord = {
    artifactDir,
    createdAt: new Date().toISOString(),
    entrypoint: BUNDLE_ENTRYPOINT,
    env: config.env,
    id: `dep_${randomBytes(6).toString("hex")}`,
    name,
    requestId: handle.lastRequestId,
    sha: input.sha,
    target: input.target,
    url:
      typeof worker.url === "string"
        ? worker.url
        : workerUrl(handle.baseUrl, name),
  };
  writeCurrentDeploy(root, record);
  return record;
}

export interface DeployResult {
  dryRun: boolean;
  manifest: string;
  record?: DeployRecord;
  sha: string;
  size: number;
  target: DeployTarget;
}

export async function runDeploy(
  ctx: CommandContext,
  opts: DeployOptions
): Promise<DeployResult> {
  if (opts.preview && opts.prod) {
    throw new CliError("INVALID_TARGET", "Choose either --preview or --prod.", {
      exitCode: EXIT_CODES.VALIDATION_ERROR,
    });
  }
  const target: DeployTarget = opts.prod ? "prod" : "preview";
  const { config, root } = await loadProjectConfig({ env: ctx.globalOpts.env });

  if (target === "prod" && !opts.dryRun) {
    await confirmProd(ctx, config, Boolean(opts.yes));
  }

  const bundle = await bundleProject({
    entry: config.entry,
    outdir: opts.outdir ?? defaultOutdir(target),
    root,
  });
  const manifest: DeployManifest = {
    createdAt: new Date().toISOString(),
    entry: config.entry,
    env: config.env,
    name: workerName(config.name, target),
    sha: bundle.sha,
    size: bundle.size,
    // Schema only — never row data — so previews carry no local records.
    stateSchema: snapshotStateSchema(root),
    target,
    vars: Object.keys(config.vars).sort(),
  };
  const manifestFile = writeManifest(bundle.outdir, manifest);

  if (opts.dryRun) {
    return {
      dryRun: true,
      manifest: manifestFile,
      sha: bundle.sha,
      size: bundle.size,
      target,
    };
  }

  const handle = await ctx.sdk();
  const record = await publish(handle, root, config, {
    artifactDir: bundle.outdir,
    sha: bundle.sha,
    target,
  });
  return {
    dryRun: false,
    manifest: manifestFile,
    record,
    sha: bundle.sha,
    size: bundle.size,
    target,
  };
}

function requireArtifact(record: DeployRecord): void {
  if (!existsSync(join(record.artifactDir, record.entrypoint))) {
    throw new CliError(
      "ARTIFACT_MISSING",
      `Artifact for ${record.name} (${record.sha.slice(0, 12)}) is no longer on disk.`,
      {
        exitCode: EXIT_CODES.NOT_FOUND,
        fix: `Re-run \`frontal deploy --${record.target}\` to rebuild it; promote/rollback never rebuild.`,
      }
    );
  }
}

/** Re-points production at a preview artifact without rebuilding. */
export async function runPromote(
  ctx: CommandContext,
  ref: string
): Promise<DeployRecord> {
  const { config, root } = await loadProjectConfig({ env: ctx.globalOpts.env });
  const source = findDeploy(root, ref);
  if (!source) {
    throw new CliError(
      "DEPLOYMENT_NOT_FOUND",
      `No recorded deployment matches "${ref}".`,
      {
        exitCode: EXIT_CODES.NOT_FOUND,
        fix: "Pass the preview URL printed by `frontal deploy --preview`.",
      }
    );
  }
  requireArtifact(source);
  const handle = await ctx.sdk();
  return await publish(handle, root, config, {
    artifactDir: source.artifactDir,
    sha: source.sha,
    target: "prod",
  });
}

export interface AgentRollback {
  agentId: string;
  error?: string;
  version?: number;
}

/**
 * Rolls back every agent listed under `agents` in frontal.jsonc to its
 * previous version (`POST /agents/{id}/rollback`). Failures are reported
 * per agent rather than aborting the worker rollback.
 */
export async function rollbackAgents(
  handle: SdkHandle,
  agentIds: string[]
): Promise<AgentRollback[]> {
  const results: AgentRollback[] = [];
  for (const agentId of agentIds) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: rollbacks are ordered
      const agent = await handle.frontal.agents.use(agentId).rollback();
      results.push({ agentId, version: agent.version });
    } catch (err) {
      const report = classifyError(err);
      results.push({ agentId, error: `${report.code}: ${report.message}` });
    }
  }
  return results;
}

export interface RollbackResult extends DeployRecord {
  agents: AgentRollback[];
}

/** Re-deploys the previous production artifact (or the one at `ref`). */
export async function runRollback(
  ctx: CommandContext,
  ref?: string
): Promise<RollbackResult> {
  const { config, root } = await loadProjectConfig({ env: ctx.globalOpts.env });
  const current = readCurrentDeploy(root, config.env, "prod");
  let source: DeployRecord | undefined;
  if (ref) {
    source = findDeploy(root, ref);
  } else {
    source = listDeploys(root).find(
      (candidate) =>
        candidate.target === "prod" &&
        candidate.env === config.env &&
        candidate.id !== current?.id
    );
  }
  if (!source) {
    throw new CliError(
      "NO_ROLLBACK_TARGET",
      ref
        ? `No recorded deployment matches "${ref}".`
        : "No previous production deployment to roll back to.",
      {
        exitCode: EXIT_CODES.NOT_FOUND,
        fix: ref
          ? "Use a URL or id from `.frontal/state/deploys`."
          : "Roll back needs at least two production deploys, or pass an explicit URL.",
      }
    );
  }
  requireArtifact(source);
  const handle = await ctx.sdk();
  const record = await publish(handle, root, config, {
    artifactDir: source.artifactDir,
    sha: source.sha,
    target: "prod",
  });
  const agents = await rollbackAgents(handle, config.agents);
  return { ...record, agents };
}

function printRecord(verb: string, record: DeployRecord): void {
  console.log(`${theme.success(verb)}  ${theme.bold(record.url)}`);
  console.log(
    theme.dim(
      `  ${record.name} · ${record.target} · sha ${record.sha.slice(0, 12)}`
    )
  );
  if (record.requestId) {
    console.log(theme.dim(`  request id: ${record.requestId}`));
  }
}

export function registerDeployCommands(program: Command): void {
  withExamples(
    program
      .command("deploy")
      .description(
        "Bundle the project and deploy it to a preview or production worker"
      )
      .option("--preview", "Deploy to the preview worker (default)")
      .option(
        "--prod",
        "Deploy to production (asks for confirmation unless --yes)"
      )
      .option("--dry-run", "Bundle and validate only; no network")
      .option("--outdir <dir>", "Where to write the bundle and manifest")
      .action((opts: DeployOptions, cmd) =>
        runAction(cmd, async (ctx) => {
          const result = await runDeploy(ctx, opts);
          if (ctx.globalOpts.json) {
            ctx.fmt.raw(result);
            return;
          }
          const rel =
            relative(process.cwd(), result.manifest) || result.manifest;
          if (result.dryRun) {
            console.log(
              `${theme.success("bundled")}  ${rel} ${theme.dim(`(${result.size} bytes, sha ${result.sha.slice(0, 12)})`)}`
            );
            console.log(theme.dim("  dry run — nothing was uploaded"));
            return;
          }
          if (result.record) {
            printRecord("deployed", result.record);
          }
        })
      ),
    [
      "frontal deploy --preview",
      "frontal deploy --prod --yes",
      "frontal deploy --dry-run --outdir dist/frontal",
    ]
  );

  withExamples(
    program
      .command("promote")
      .description(
        "Point production at a previously deployed preview (no rebuild)"
      )
      .argument("<url>", "Preview URL (or deployment id) to promote")
      .action((url: string, _opts, cmd) =>
        runAction(cmd, async (ctx) => {
          const record = await runPromote(ctx, url);
          if (ctx.globalOpts.json) {
            ctx.fmt.raw(record);
            return;
          }
          printRecord("promoted", record);
        })
      ),
    ["frontal promote https://api.frontal.dev/v1/workers/my-app-preview"]
  );

  withExamples(
    program
      .command("rollback")
      .description(
        "Re-deploy the previous production artifact (or a specific one)"
      )
      .argument(
        "[url]",
        "Deployment URL or id to roll back to (default: previous prod)"
      )
      .action((url: string | undefined, _opts, cmd) =>
        runAction(cmd, async (ctx) => {
          const record = await runRollback(ctx, url);
          if (ctx.globalOpts.json) {
            ctx.fmt.raw(record);
            return;
          }
          printRecord("rolled back", record);
          for (const agent of record.agents) {
            console.log(
              agent.error
                ? `  ${theme.error("✗")} agent ${agent.agentId}: ${agent.error}`
                : `  ${theme.success("✓")} agent ${agent.agentId} → v${agent.version}`
            );
          }
        })
      ),
    ["frontal rollback", "frontal rollback dep_1a2b3c4d5e6f"]
  );
}
