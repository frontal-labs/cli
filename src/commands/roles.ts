import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { confirmAction } from "../utils/interactive.js";

function resolveOrgId(opts: Record<string, unknown>, cmd: Command): string {
  const config = resolveConfig(cmd.optsWithGlobals());
  const orgId = (opts.org as string) ?? config.orgId;
  if (!orgId) {
    throw new Error(
      "Organization ID required. Use --org or set via `orgs use`."
    );
  }
  return orgId;
}

export function registerRolesCommands(program: Command): void {
  const roles = program.command("roles").description("Manage roles");

  roles
    .command("list")
    .description("List roles")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${orgId}/roles`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  roles
    .command("create")
    .description("Create a new role")
    .requiredOption("--name <name>", "Role name")
    .requiredOption("--permissions <json>", "Permissions as JSON string")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const permissions = JSON.parse(opts.permissions);
        const result = await api.post(`/orgs/${orgId}/roles`, {
          name: opts.name,
          permissions,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  roles
    .command("get")
    .description("Get role details")
    .argument("<role-id>", "Role ID")
    .option("--org <org-id>", "Organization ID")
    .action(async (roleId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${orgId}/roles/${roleId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  roles
    .command("update")
    .description("Update a role")
    .argument("<role-id>", "Role ID")
    .option("--name <name>", "New name")
    .option("--permissions <json>", "Permissions as JSON string")
    .option("--org <org-id>", "Organization ID")
    .action(async (roleId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        if (opts.permissions) {
          body.permissions = JSON.parse(opts.permissions);
        }
        const result = await api.patch(`/orgs/${orgId}/roles/${roleId}`, body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  roles
    .command("delete")
    .description("Delete a role")
    .argument("<role-id>", "Role ID")
    .option("--force", "Skip confirmation")
    .option("--org <org-id>", "Organization ID")
    .action(async (roleId, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete role "${roleId}"? This action cannot be undone.`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        await api.delete(`/orgs/${orgId}/roles/${roleId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Role deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
