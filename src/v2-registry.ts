import type { Command } from "commander";
import { registerCompletionCommands } from "./commands/completion.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerAuthV2Commands } from "./commands-v2/auth-v2.js";
import { registerEventsV2Commands } from "./commands-v2/events-v2.js";
import { registerInvocationsV2Commands } from "./commands-v2/invocations-v2.js";
import { registerMigrateV2Command } from "./commands-v2/migrate-v2.js";
import { registerRunsV2Commands } from "./commands-v2/runs-v2.js";
import { registerWorkflowsV2Commands } from "./commands-v2/workflows-v2.js";
import { installWatchMiddleware } from "./middleware/watch.js";

export function registerV2Commands(program: Command): void {
  registerAuthV2Commands(program);
  registerConfigCommands(program);
  registerWorkflowsV2Commands(program);
  registerInvocationsV2Commands(program);
  registerRunsV2Commands(program);
  registerEventsV2Commands(program);
  registerMigrateV2Command(program);
  registerCompletionCommands(program);

  installWatchMiddleware(program);
}
