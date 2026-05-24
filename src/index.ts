import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCompletionCommands } from "./commands/completion.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerEventsCommands } from "./commands/events.js";
import { registerInvocationsCommands } from "./commands/invocations.js";
import { registerMigrateCommand } from "./commands/migrate.js";
import { registerRunsCommands } from "./commands/runs.js";
import { registerWorkflowsCommands } from "./commands/workflows.js";
import { installWatchMiddleware } from "./middleware/watch.js";
import { VERSION } from "./version.js";

export async function run(argv: string[]) {
  const program = new Command()
    .name("frontal")
    .description("Frontal CLI")
    .version(VERSION)
    .option("-p, --profile <name>", "Config profile", "default")
    .option("--api-key <key>", "Override API key")
    .option("--api-url <url>", "Override API base URL")
    .option("-j, --json", "Output as JSON")
    .option("--yaml", "Output as YAML")
    .option("-q, --quiet", "Suppress non-essential output")
    .option("-v, --verbose", "Verbose logging")
    .option("--debug", "Debug mode")
    .option("--no-color", "Disable colors");

  registerAuthCommands(program);
  registerConfigCommands(program);
  registerWorkflowsCommands(program);
  registerInvocationsCommands(program);
  registerRunsCommands(program);
  registerEventsCommands(program);
  registerMigrateCommand(program);
  registerCompletionCommands(program);

  installWatchMiddleware(program);

  await program.parseAsync(argv);
}
