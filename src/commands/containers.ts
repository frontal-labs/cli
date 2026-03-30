import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerContainersCommands(program: Command): void {
  const containers = program
    .command("containers")
    .description("Manage containers");

  containers
    .command("list")
    .description("List all containers")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/containers"
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "image", header: "IMAGE" },
          { key: "status", header: "STATUS" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("create")
    .description("Create a container")
    .requiredOption("--name <n>", "Container name")
    .requiredOption("--image <img>", "Container image")
    .option("--from-file <path>", "Load config from file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = opts.fromFile
          ? {
              name: opts.name,
              image: opts.image,
              ...readDefinitionFile(opts.fromFile),
            }
          : { name: opts.name, image: opts.image };
        const result = await api.post<Record<string, unknown>>(
          "/containers",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("get")
    .description("Get container details")
    .argument("<id>", "Container ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/containers/${id}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("update")
    .description("Update a container")
    .argument("<id>", "Container ID")
    .option("--from-file <path>", "Load config from file")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.fromFile ? readDefinitionFile(opts.fromFile) : {};
        const result = await api.put<Record<string, unknown>>(
          `/containers/${id}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("delete")
    .description("Delete a container")
    .argument("<id>", "Container ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete container ${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/containers/${id}`);
        fmt.success(`Container ${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("start")
    .description("Start a container")
    .argument("<id>", "Container ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.post(`/containers/${id}/start`);
        fmt.success(`Container ${id} started.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("stop")
    .description("Stop a container")
    .argument("<id>", "Container ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.post(`/containers/${id}/stop`);
        fmt.success(`Container ${id} stopped.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("scale")
    .description("Scale a container")
    .argument("<id>", "Container ID")
    .requiredOption("--replicas <n>", "Number of replicas")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.post(`/containers/${id}/scale`, {
          replicas: Number(opts.replicas),
        });
        fmt.success(`Container ${id} scaled to ${opts.replicas} replicas.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("metrics")
    .description("Get container metrics")
    .argument("<id>", "Container ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/containers/${id}/metrics`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("secrets")
    .description("List container secrets")
    .argument("<id>", "Container ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/containers/${id}/secrets`
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "key", header: "KEY" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("secret:create")
    .description("Create a container secret")
    .argument("<container-id>", "Container ID")
    .requiredOption("--key <k>", "Secret key")
    .requiredOption("--value <v>", "Secret value")
    .action(async (containerId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/containers/${containerId}/secrets`,
          { key: opts.key, value: opts.value }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("secret:update")
    .description("Update a container secret")
    .argument("<container-id>", "Container ID")
    .argument("<secret-id>", "Secret ID")
    .requiredOption("--value <v>", "New secret value")
    .action(async (containerId, secretId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.put<Record<string, unknown>>(
          `/containers/${containerId}/secrets/${secretId}`,
          { value: opts.value }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  containers
    .command("secret:delete")
    .description("Delete a container secret")
    .argument("<container-id>", "Container ID")
    .argument("<secret-id>", "Secret ID")
    .action(async (containerId, secretId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/containers/${containerId}/secrets/${secretId}`);
        fmt.success("Secret deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
