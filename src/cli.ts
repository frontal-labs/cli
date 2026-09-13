import chalk from "chalk";
import { Command } from "commander";
import { registerAuthCommands } from "@/commands/auth.js";
import { registerCompletionCommands } from "@/commands/completion.js";
import { registerConfigCommands } from "@/commands/config.js";
import { registerDeployCommands } from "@/commands/deploy.js";
import { registerDevCommand } from "@/commands/dev.js";
import { registerEnvCommands } from "@/commands/env.js";
import { registerEventsCommands } from "@/commands/events.js";
import { registerInitCommand } from "@/commands/init.js";
import { registerInvocationsCommands } from "@/commands/invocations.js";
import { registerLogsCommand } from "@/commands/logs.js";
import { registerMigrateCommand } from "@/commands/migrate.js";
import { registerPolicyCommands } from "@/commands/policy.js";
import { registerRunsCommands } from "@/commands/runs.js";
import { registerTypesCommand } from "@/commands/types.js";
import { registerVersionCommand } from "@/commands/version.js";
import { registerWorkflowsCommands } from "@/commands/workflows.js";
import { applyCommandExamples } from "@/lib/examples.js";
import { installWatchMiddleware } from "@/middleware/watch.js";
import { configureHelp } from "@/output/help.js";
import { VERSION } from "@/version.js";

/** Registers global options and every command on `program`. */
export function buildProgram(program = new Command()): Command {
  if (process.argv.includes("--no-color") || process.env.NO_COLOR) {
    chalk.level = 0;
  }
  program
    .name("frontal")
    .description("Frontal CLI")
    .usage("[options] <command> [subcommand] [args]")
    .version(VERSION, "-V, --version", "Print the version number")
    .helpOption("-h, --help", "Show help for a command")
    .helpCommand("help [command]", "Show help for a command")
    .option(
      "-p, --profile <name>",
      "Config profile (default: active profile or FRONTAL_PROFILE)"
    )
    .option("--api-key <key>", "Override API key")
    .option("--api-url <url>", "Override API base URL")
    .option("--env <name>", "Target environment (dev | staging | prod)")
    .option("-y, --yes", "Assume yes for confirmation prompts (CI)")
    .option("-j, --json", "Output as JSON")
    .option("--yaml", "Output as YAML")
    .option("-q, --quiet", "Suppress non-essential output")
    .option("-v, --verbose", "Verbose logging")
    .option("--debug", "Debug mode")
    .option("--no-color", "Disable colors");

  registerInitCommand(program);
  registerDevCommand(program);
  registerTypesCommand(program);
  registerEnvCommands(program);
  registerLogsCommand(program);
  registerPolicyCommands(program);
  registerDeployCommands(program);
  registerAuthCommands(program);
  registerConfigCommands(program);
  registerWorkflowsCommands(program);
  registerInvocationsCommands(program);
  registerRunsCommands(program);
  registerEventsCommands(program);
  registerMigrateCommand(program);
  registerCompletionCommands(program);
  registerVersionCommand(program);

  applyCommandExamples(program);
  configureHelp(program);
  installWatchMiddleware(program);
  return program;
}

export async function run(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}
