import type { Command } from "commander";
import { configManager } from "../config/manager.js";
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

function resolveWorkspaceId(wsId: string | undefined, cmd: Command): string {
  if (wsId) {
    return wsId;
  }
  const config = resolveConfig(cmd.optsWithGlobals());
  if (config.workspaceId) {
    return config.workspaceId;
  }
  throw new Error(
    "Workspace ID required. Provide as argument or set via `workspaces use`."
  );
}

export function registerWorkspacesCommands(program: Command): void {
  const workspaces = program
    .command("workspaces")
    .description("Manage workspaces");

  workspaces
    .command("list")
    .description("List workspaces")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${orgId}/workspaces`
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

  workspaces
    .command("create")
    .description("Create a new workspace")
    .requiredOption("--name <name>", "Workspace name")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(`/orgs/${orgId}/workspaces`, {
          name: opts.name,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("get")
    .description("Get workspace details")
    .argument("<ws-id>", "Workspace ID")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${orgId}/workspaces/${wsId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("update")
    .description("Update a workspace")
    .argument("<ws-id>", "Workspace ID")
    .option("--name <name>", "New name")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        const result = await api.patch(
          `/orgs/${orgId}/workspaces/${wsId}`,
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("delete")
    .description("Delete a workspace")
    .argument("<ws-id>", "Workspace ID")
    .option("--force", "Skip confirmation")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete workspace "${wsId}"? This action cannot be undone.`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        await api.delete(`/orgs/${orgId}/workspaces/${wsId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Workspace deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("use")
    .description("Set the active workspace")
    .argument("<ws-id>", "Workspace ID")
    .action(async (wsId, _opts, cmd) => {
      try {
        const profileName =
          cmd.optsWithGlobals().profile ?? configManager.getActiveProfileName();
        configManager.setProfile(profileName, { workspaceId: wsId });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success(`Active workspace set to "${wsId}".`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("settings")
    .description("View workspace settings")
    .argument("[ws-id]", "Workspace ID (defaults to config)")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const id = resolveWorkspaceId(wsId, cmd);
        const api = new ApiClient(config);
        const result = await api.get(
          `/orgs/${orgId}/workspaces/${id}/settings`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("settings:update")
    .description("Update workspace settings")
    .argument("<ws-id>", "Workspace ID")
    .requiredOption("--key <key>", "Setting key")
    .requiredOption("--value <value>", "Setting value")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.patch(
          `/orgs/${orgId}/workspaces/${wsId}/settings`,
          {
            [opts.key]: opts.value,
          }
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("projects")
    .description("List projects in a workspace")
    .argument("[ws-id]", "Workspace ID (defaults to config)")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const id = resolveWorkspaceId(wsId, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${orgId}/workspaces/${id}/projects`
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

  workspaces
    .command("project:create")
    .description("Create a project in a workspace")
    .argument("<ws-id>", "Workspace ID")
    .requiredOption("--name <name>", "Project name")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(
          `/orgs/${orgId}/workspaces/${wsId}/projects`,
          {
            name: opts.name,
          }
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("project:get")
    .description("Get project details")
    .argument("<ws-id>", "Workspace ID")
    .argument("<proj-id>", "Project ID")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, projId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(
          `/orgs/${orgId}/workspaces/${wsId}/projects/${projId}`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("project:update")
    .description("Update a project")
    .argument("<ws-id>", "Workspace ID")
    .argument("<proj-id>", "Project ID")
    .option("--name <name>", "New name")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, projId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        const result = await api.patch(
          `/orgs/${orgId}/workspaces/${wsId}/projects/${projId}`,
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workspaces
    .command("project:delete")
    .description("Delete a project")
    .argument("<ws-id>", "Workspace ID")
    .argument("<proj-id>", "Project ID")
    .option("--force", "Skip confirmation")
    .option("--org <org-id>", "Organization ID")
    .action(async (wsId, projId, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete project "${projId}"? This action cannot be undone.`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        await api.delete(
          `/orgs/${orgId}/workspaces/${wsId}/projects/${projId}`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Project deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
