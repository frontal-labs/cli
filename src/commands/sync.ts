import { join } from "node:path";
import type { Command } from "commander";
import { type CommandContext, runAction } from "@/lib/command.js";
import { loadProjectConfig } from "@/lib/config.js";
import { GENERATOR_VERSION } from "@/lib/ontology/constants.js";
import { outOfDate } from "@/lib/ontology/errors.js";
import { fetchObjectTypes } from "@/lib/ontology/remote.js";
import {
  checkOntology,
  type FileChange,
  type LocalSnapshot,
  type OntologyContext,
  type StatusOutcome,
  type SyncOutcome,
  statusOntology,
  syncOntology,
} from "@/lib/ontology/sync.js";
import { withExamples } from "@/lib/output.js";
import { PROJECT_STATE_DIR } from "@/lib/project.js";
import type { SdkHandle } from "@/lib/sdk.js";
import { theme } from "@/output/theme.js";

/** Project facts every ontology command reports. */
interface ProjectInfo {
  context: OntologyContext;
  environment: string;
  name: string;
}

async function projectInfo(ctx: CommandContext): Promise<ProjectInfo> {
  const project = await loadProjectConfig({ env: ctx.globalOpts.env });
  return {
    context: {
      frontalDir: join(project.root, PROJECT_STATE_DIR),
      generatorVersion: GENERATOR_VERSION,
    },
    environment: project.config.env,
    name: project.config.name,
  };
}

/** Label column width for aligned per-file output. */
const LABEL_WIDTH = 10;

function label(text: string): string {
  return text.padEnd(LABEL_WIDTH);
}

function sourceOf(handle: SdkHandle): () => Promise<unknown[]> {
  return () => fetchObjectTypes(handle);
}

function fileLabel(outcome: FileChange["outcome"]): string {
  switch (outcome) {
    case "created":
      return theme.success(label("created"));
    case "updated":
      return theme.warn(label("updated"));
    case "unchanged":
      return theme.dim(label("unchanged"));
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}

function printSync(outcome: SyncOutcome, changed: boolean): void {
  for (const removed of outcome.removedTemporaries) {
    console.log(
      `${theme.dim(label("cleaned"))}${join(PROJECT_STATE_DIR, removed)}`
    );
  }
  for (const file of outcome.files) {
    console.log(
      `${fileLabel(file.outcome)}${join(PROJECT_STATE_DIR, file.file)}`
    );
  }
  for (const warning of outcome.warnings) {
    console.log(`${theme.warn(label("warn"))}${warning}`);
  }
  if (!changed) {
    console.log(
      `${theme.success("ok")} Local types are already synchronised (${outcome.schemaHash}).`
    );
    return;
  }
  console.log(
    `${theme.success("synced")} ${outcome.entityCount} entities (${outcome.schemaHash})`
  );
  console.log("");
  console.log(theme.bold("Next:"));
  console.log(
    `  commit ${PROJECT_STATE_DIR}/ so CI can compile without credentials`
  );
  console.log(`  import { createFrontal } from "${PROJECT_STATE_DIR}/client"`);
}

function printStatus(
  outcome: StatusOutcome,
  info: ProjectInfo,
  status: string
): void {
  console.log(`Frontal Project: ${info.name}`);
  console.log(`Environment: ${info.environment}`);
  console.log("");
  console.log(`Local ontology:  ${describeLocal(outcome.local)}`);
  console.log(
    `Remote ontology: ${outcome.remote.schemaHash} (${outcome.remote.entityCount} entities)`
  );
  console.log("");
  console.log(`Status: ${status}`);
  if (!outcome.upToDate) {
    console.log("");
    console.log("Run frontal sync to update generated types.");
  }
}

function describeLocal(local: LocalSnapshot): string {
  switch (local.state) {
    case "synced":
      return `${local.schemaHash} (${local.entityCount} entities)`;
    case "missing":
      return "not synced yet";
    case "unreadable":
      return `unreadable (${local.problem})`;
    default: {
      const exhaustive: never = local;
      return exhaustive;
    }
  }
}

/** Offline CI check. Prints the report in both modes; exits non-zero when stale. */
function runCheck(ctx: CommandContext, info: ProjectInfo): void {
  const outcome = checkOntology(info.context);
  const ok = outcome.stale.length === 0;
  if (ctx.globalOpts.json) {
    ctx.fmt.raw({ ...outcome, ok });
  }
  if (!ok) {
    throw outOfDate(outcome.stale);
  }
  if (!ctx.globalOpts.json) {
    console.log(
      `${theme.success("ok")} generated files match ontology ${outcome.schemaHash} (${outcome.entityCount} entities)`
    );
  }
}

async function runSync(ctx: CommandContext, info: ProjectInfo): Promise<void> {
  const handle = await ctx.sdk();
  const outcome = await syncOntology(info.context, sourceOf(handle));
  const changed =
    outcome.files.some((file) => file.outcome !== "unchanged") ||
    outcome.removedTemporaries.length > 0;
  if (ctx.globalOpts.json) {
    ctx.fmt.raw({ ...outcome, changed });
    return;
  }
  printSync(outcome, changed);
}

async function runStatus(
  ctx: CommandContext,
  info: ProjectInfo
): Promise<void> {
  const handle = await ctx.sdk();
  const outcome = await statusOntology(info.context, sourceOf(handle));
  const status = outcome.upToDate ? "UP TO DATE" : "OUTDATED";
  if (ctx.globalOpts.json) {
    ctx.fmt.raw({
      environment: info.environment,
      local: outcome.local,
      project: info.name,
      remote: outcome.remote,
      status,
    });
    return;
  }
  printStatus(outcome, info, status);
}

export function registerSyncCommands(program: Command): void {
  withExamples(
    program
      .command("sync")
      .description(
        "Download the ontology and regenerate typed SDK files in .frontal/"
      )
      .option(
        "--check",
        "Offline: fail when committed generated files do not match .frontal/ontology.json"
      )
      .action((opts: { check?: boolean }, cmd) =>
        runAction(cmd, async (ctx) => {
          const info = await projectInfo(ctx);
          if (opts.check) {
            runCheck(ctx, info);
            return;
          }
          await runSync(ctx, info);
        })
      ),
    [
      "frontal sync",
      "frontal sync --check   # CI: offline, no credentials needed",
      "frontal sync --json",
    ]
  );

  withExamples(
    program
      .command("status")
      .description("Compare the committed ontology snapshot with Frontal")
      .action((_opts: unknown, cmd) =>
        runAction(cmd, async (ctx) => {
          const info = await projectInfo(ctx);
          await runStatus(ctx, info);
        })
      ),
    ["frontal status", "frontal status --json"]
  );
}
