import { join } from "node:path";
import type { Command } from "commander";
import { assertOperationSupported } from "@/contract/operations.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { type CommandContext, runAction } from "@/lib/command.js";
import { loadProjectConfig } from "@/lib/config.js";
import {
  checkOntology,
  collectPages,
  type OntologyContext,
  type PageLike,
  type StatusOutcome,
  type SyncOutcome,
  statusOntology,
  syncOntology,
} from "@/lib/ontology/sync.js";
import { withExamples } from "@/lib/output.js";
import { PROJECT_STATE_DIR } from "@/lib/project.js";
import type { SdkHandle } from "@/lib/sdk.js";
import { theme } from "@/output/theme.js";
import { VERSION } from "@/version.js";

const OBJECT_TYPES_PATH = "/ontology/objects/object-types";

/** Lists every object type through the SDK's paged ontology namespace. */
async function fetchObjectTypes(handle: SdkHandle): Promise<unknown[]> {
  assertOperationSupported("GET", OBJECT_TYPES_PATH);
  const first = await handle.frontal.ontology.objects.listObjectTypes();
  return collectPages(first as PageLike<Record<string, unknown>>);
}

interface ProjectInfo {
  context: OntologyContext;
  env: string;
  name: string;
}

/** Resolves the project and the `.frontal/` directory the command operates on. */
async function projectInfo(ctx: CommandContext): Promise<ProjectInfo> {
  const project = await loadProjectConfig({ env: ctx.globalOpts.env });
  return {
    context: {
      frontalDir: join(project.root, PROJECT_STATE_DIR),
      generatorVersion: VERSION,
    },
    env: project.config.env,
    name: project.config.name,
  };
}

/** Offline CI check: exits non-zero when committed generated files are stale. */
function runCheck(ctx: CommandContext, info: ProjectInfo): void {
  const outcome = checkOntology(info.context);
  if (ctx.globalOpts.json) {
    ctx.fmt.raw(outcome);
  }
  if (outcome.stale.length > 0) {
    throw new CliError(
      "ONTOLOGY_OUT_OF_DATE",
      `Generated files do not match .frontal/ontology.json: ${outcome.stale.join(", ")}.`,
      {
        exitCode: EXIT_CODES.VALIDATION_ERROR,
        fix: "Run `frontal sync` locally and commit the .frontal/ changes.",
      }
    );
  }
  if (!ctx.globalOpts.json) {
    console.log(
      `${theme.success("ok")}  generated files match ontology ${outcome.schemaHash}`
    );
  }
}

function printSyncResult(outcome: SyncOutcome): void {
  for (const warning of outcome.warnings) {
    console.log(`${theme.warn("warn")}    ${warning}`);
  }
  const changed = Object.entries(outcome.files).filter(
    ([, state]) => state !== "unchanged"
  );
  if (changed.length === 0) {
    console.log(
      `${theme.success("ok")}  local types are already synchronised (${outcome.schemaHash})`
    );
    return;
  }
  for (const [key, state] of changed) {
    console.log(`${theme.success(state)}  ${key}`);
  }
  console.log(
    `${theme.success("synced")} ${outcome.entityCount} entities (${outcome.schemaHash})`
  );
}

async function runSync(ctx: CommandContext, info: ProjectInfo): Promise<void> {
  const handle = await ctx.sdk();
  const outcome = await syncOntology(info.context, () =>
    fetchObjectTypes(handle)
  );
  if (ctx.globalOpts.json) {
    ctx.fmt.raw(outcome);
    return;
  }
  printSyncResult(outcome);
}

function printStatus(
  outcome: StatusOutcome,
  info: ProjectInfo,
  status: string
): void {
  const localLine =
    outcome.localHash ?? `unavailable (${outcome.localProblem ?? "unknown"})`;
  console.log(`Frontal Project: ${info.name}`);
  console.log(`Environment: ${info.env}`);
  console.log("");
  console.log(`Local ontology:  ${localLine}`);
  console.log(
    `Remote ontology: ${outcome.remoteHash} (${outcome.remoteEntityCount} entities)`
  );
  console.log("");
  console.log(`Status: ${status}`);
  if (!outcome.upToDate) {
    console.log("");
    console.log("Run `frontal sync` to update generated types.");
  }
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
        "Offline: fail if committed generated files do not match .frontal/ontology.json"
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
      .description("Compare the local ontology snapshot with Frontal")
      .action((_opts: unknown, cmd) =>
        runAction(cmd, async (ctx) => {
          const info = await projectInfo(ctx);
          const handle = await ctx.sdk();
          const outcome = await statusOntology(info.context, () =>
            fetchObjectTypes(handle)
          );
          const status = outcome.upToDate ? "UP TO DATE" : "OUTDATED";
          if (ctx.globalOpts.json) {
            ctx.fmt.raw({ ...outcome, status });
            return;
          }
          printStatus(outcome, info, status);
        })
      ),
    ["frontal status", "frontal status --json"]
  );
}
