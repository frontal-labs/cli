import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { theme } from "../output/theme.js";
import { readFrontalJson } from "../utils/file.js";
import {
  evaluateCondition,
  parseUntilCondition,
  poll,
} from "../utils/polling.js";

const PROJECT_FILE = ".frontal/project";

function readProjectId(cwd: string): string | undefined {
  const filePath = join(cwd, PROJECT_FILE);
  if (!existsSync(filePath)) {
    return undefined;
  }
  return readFileSync(filePath, "utf-8").trim() || undefined;
}

function saveProjectId(cwd: string, projectId: string): void {
  const dir = join(cwd, ".frontal");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(cwd, PROJECT_FILE), `${projectId}\n`, "utf-8");
}

export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description("Deploy from frontal.json configuration")
    .option("--config <path>", "Path to frontal.json directory")
    .option("--project <id>", "Project ID")
    .option(
      "--environment <env>",
      "Target environment (preview, staging, production)",
      "preview"
    )
    .option("--watch", "Watch deployment status until terminal")
    .option(
      "--until <condition>",
      "Poll until condition is met (e.g. status=RUNNING)"
    )
    .action(async (opts, cmd) => {
      try {
        const cwd = process.cwd();
        const globalOpts = cmd.optsWithGlobals();
        const resolved = resolveConfig(globalOpts);
        const api = new ApiClient(resolved);
        const fmt = Formatter.from(globalOpts);

        // 1. Read and validate frontal.json
        const configDir = opts.config ?? undefined;
        const config = readFrontalJson(configDir);

        // 2. Resolve project ID
        const projectId: string | undefined =
          opts.project ?? process.env.FRONTAL_PROJECT_ID ?? readProjectId(cwd);

        if (!projectId) {
          throw new Error(
            "No project ID specified. Use --project <id> or set FRONTAL_PROJECT_ID."
          );
        }

        // 3. Build deployment payload from frontal.json
        const payload: Record<string, unknown> = {
          project: projectId,
          name: config.name,
          environment: opts.environment,
          framework: config.framework,
          build: config.build
            ? {
                command: config.build.command,
                outputDirectory: config.build.outputDirectory,
                installCommand: config.build.installCommand,
                environment: config.build.env,
              }
            : undefined,
          regions: config.regions,
          features: config.features,
          headers: config.headers,
          rewrites: config.rewrites,
          redirects: config.redirects,
          functions: config.functions,
        };

        // Remove undefined values
        for (const key of Object.keys(payload)) {
          if (payload[key] === undefined) {
            delete payload[key];
          }
        }

        // 4. Create deployment
        const deployment = await api.post<Record<string, unknown>>(
          "/deployments",
          payload
        );

        const deploymentId = deployment.id as string;

        // 5. Save project ID for future runs
        saveProjectId(cwd, projectId);

        console.log(
          theme.success(
            `Deployment ${deploymentId} created (${opts.environment})`
          )
        );

        // 6. Handle --watch or --until
        if (opts.watch || opts.until) {
          const condition = opts.until
            ? parseUntilCondition(opts.until)
            : undefined;

          const shouldStop = (data: Record<string, unknown>): boolean => {
            if (condition) {
              return evaluateCondition(data, condition);
            }
            // In watch mode, stop on terminal statuses
            const status = String(data.status ?? "").toUpperCase();
            return ["READY", "FAILED", "CANCELLED", "ERROR"].includes(status);
          };

          console.log(theme.dim("Watching deployment status..."));

          for await (const result of poll(
            () =>
              api.get<Record<string, unknown>>(`/deployments/${deploymentId}`),
            { interval: 2000, until: shouldStop }
          )) {
            const status = result.status ?? "UNKNOWN";
            console.log(theme.dim(`  Status: ${status}`));

            if (shouldStop(result)) {
              fmt.object(result);
              break;
            }
          }
        } else {
          fmt.object(deployment);
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
