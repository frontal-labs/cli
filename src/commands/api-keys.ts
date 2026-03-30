import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { confirmAction } from "../utils/interactive.js";

export function registerApiKeysCommands(program: Command): void {
  const apiKeys = program.command("api-keys").description("Manage API keys");

  apiKeys
    .command("list")
    .description("List API keys")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/api-keys"
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "keyPrefix", header: "PREFIX" },
          { key: "status", header: "STATUS" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  apiKeys
    .command("create")
    .description("Create a new API key")
    .requiredOption("--name <name>", "Key name")
    .option("--scopes <scopes>", "Comma-separated scopes")
    .option("--expires <date>", "Expiration date (ISO 8601)")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const body: Record<string, unknown> = { name: opts.name };
        if (opts.scopes) {
          body.scopes = opts.scopes.split(",").map((s: string) => s.trim());
        }
        if (opts.expires) {
          body.expiresAt = opts.expires;
        }
        const result = await api.post("/api-keys", body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  apiKeys
    .command("get")
    .description("Get API key details")
    .argument("<id>", "API key ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get(`/api-keys/${id}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  apiKeys
    .command("update")
    .description("Update an API key")
    .argument("<id>", "API key ID")
    .option("--name <name>", "New name")
    .option("--scopes <scopes>", "Comma-separated scopes")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        if (opts.scopes) {
          body.scopes = opts.scopes.split(",").map((s: string) => s.trim());
        }
        const result = await api.patch(`/api-keys/${id}`, body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  apiKeys
    .command("revoke")
    .description("Revoke an API key")
    .argument("<id>", "API key ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Revoke API key "${id}"? This action cannot be undone.`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        await api.delete(`/api-keys/${id}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("API key revoked.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
