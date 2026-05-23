import type { Command } from "commander";
import { generateBashCompletions } from "../completions/bash.js";
import { generateFishCompletions } from "../completions/fish.js";
import { generateZshCompletions } from "../completions/zsh.js";

export function registerCompletionCommands(program: Command): void {
  const completion = program
    .command("completion")
    .description("Generate shell completion scripts");

  completion
    .command("bash")
    .description("Generate bash completion script")
    .action(() => {
      console.log(generateBashCompletions(program));
    });

  completion
    .command("zsh")
    .description("Generate zsh completion script")
    .action(() => {
      console.log(generateZshCompletions(program));
    });

  completion
    .command("fish")
    .description("Generate fish completion script")
    .action(() => {
      console.log(generateFishCompletions(program));
    });

  // Hidden command for dynamic completions
  program
    .command("__complete", { hidden: true })
    .argument("<type>")
    .action((type: string) => {
      // Dynamic completion helper — can call API to resolve resource IDs
      // Usage: frontal __complete orgs
      // For now outputs nothing; extend later with API-backed lookups
      switch (type) {
        case "orgs":
        case "workspaces":
        case "teams":
        case "roles":
        case "agents":
        case "functions":
        case "containers":
        case "deployments":
          // Placeholder for API-based completion
          break;
        default:
          break;
      }
    });
}
