import { Command } from "commander";
import { registerV2Commands } from "./v2-registry.js";
import { VERSION } from "./version.js";

export async function run(argv: string[]) {
  const program = new Command()
    .name("frontal")
    .description("Frontal CLI v2")
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

  registerV2Commands(program);

  await program.parseAsync(argv);
}
