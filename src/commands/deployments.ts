import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerDeploymentsCommands(program: Command): void {
  const deployments = program
    .command("deployments")
    .description("Manage deployments");

  deployments
    .command("list")
    .description("List deployments")
    .option("--project <id>", "Filter by project ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.project) {
          params.project = opts.project;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/deployments",
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "project", header: "PROJECT" },
          { key: "status", header: "STATUS" },
          { key: "version", header: "VERSION" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  deployments
    .command("create")
    .description("Create a deployment")
    .requiredOption("--project <id>", "Project ID")
    .option("--from-file <path>", "Load config from file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = opts.fromFile
          ? { project: opts.project, ...readDefinitionFile(opts.fromFile) }
          : { project: opts.project };
        const result = await api.post<Record<string, unknown>>(
          "/deployments",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  deployments
    .command("get")
    .description("Get deployment details")
    .argument("<id>", "Deployment ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/deployments/${id}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  deployments
    .command("update")
    .description("Update a deployment")
    .argument("<id>", "Deployment ID")
    .option("--from-file <path>", "Load config from file")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.fromFile ? readDefinitionFile(opts.fromFile) : {};
        const result = await api.put<Record<string, unknown>>(
          `/deployments/${id}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  deployments
    .command("delete")
    .description("Delete a deployment")
    .argument("<id>", "Deployment ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete deployment ${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/deployments/${id}`);
        fmt.success(`Deployment ${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  deployments
    .command("rollback")
    .description("Rollback a deployment")
    .argument("<id>", "Deployment ID")
    .option("--to-version <n>", "Target version number")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.toVersion) {
          body.toVersion = Number(opts.toVersion);
        }
        const result = await api.post<Record<string, unknown>>(
          `/deployments/${id}/rollback`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
