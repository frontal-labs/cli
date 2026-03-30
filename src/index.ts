import { Command } from "commander";
import { registerAgentsCommands } from "./commands/agents.js";
import { registerApiKeysCommands } from "./commands/api-keys.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerBillingCommands } from "./commands/billing.js";
import { registerBlobCommands } from "./commands/blob.js";
import { registerCompletionCommands } from "./commands/completion.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerContainersCommands } from "./commands/containers.js";
import { registerDeployCommand } from "./commands/deploy.js";
import { registerDeploymentsCommands } from "./commands/deployments.js";
import { registerFunctionsCommands } from "./commands/functions.js";
import { registerGraphCommands } from "./commands/graph.js";
import { registerInitCommands } from "./commands/init.js";
import { registerMarketplaceCommands } from "./commands/marketplace.js";
import { registerOntologyCommands } from "./commands/ontology.js";
import { registerOrgsCommands } from "./commands/orgs.js";
import { registerPipelinesCommands } from "./commands/pipelines.js";
import { registerPoliciesCommands } from "./commands/policies.js";
import { registerRolesCommands } from "./commands/roles.js";
import { registerTeamsCommands } from "./commands/teams.js";
import { registerUseCommand } from "./commands/use.js";
import { registerWorkflowsCommands } from "./commands/workflows.js";
import { registerWorkspacesCommands } from "./commands/workspaces.js";
import { installWatchMiddleware } from "./middleware/watch.js";
import { VERSION } from "./version.js";

export async function run(argv: string[]) {
  const program = new Command()
    .name("frontal")
    .description("Frontal platform CLI")
    .version(VERSION)
    .option("-p, --profile <name>", "Config profile", "default")
    .option("-o, --org <id>", "Organization context")
    .option("-w, --workspace <id>", "Workspace context")
    .option("--api-key <key>", "Override API key")
    .option("--api-url <url>", "Override API base URL")
    .option("-j, --json", "Output as JSON")
    .option("--yaml", "Output as YAML")
    .option("-q, --quiet", "Suppress non-essential output")
    .option("-v, --verbose", "Verbose logging")
    .option("--debug", "Debug mode")
    .option("--no-color", "Disable colors");

  // Top-level convenience commands
  registerInitCommands(program);
  registerDeployCommand(program);
  registerUseCommand(program);

  registerAuthCommands(program);
  registerConfigCommands(program);
  registerOrgsCommands(program);
  registerWorkspacesCommands(program);
  registerTeamsCommands(program);
  registerRolesCommands(program);
  registerPoliciesCommands(program);
  registerApiKeysCommands(program);
  registerBillingCommands(program);
  registerAgentsCommands(program);
  registerBlobCommands(program);
  registerFunctionsCommands(program);
  registerContainersCommands(program);
  registerMarketplaceCommands(program);
  registerDeploymentsCommands(program);
  registerGraphCommands(program);
  registerOntologyCommands(program);
  registerPipelinesCommands(program);
  registerWorkflowsCommands(program);
  registerCompletionCommands(program);

  // Middleware (must be after command registration)
  installWatchMiddleware(program);

  await program.parseAsync(argv);
}
