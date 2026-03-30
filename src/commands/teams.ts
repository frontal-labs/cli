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

export function registerTeamsCommands(program: Command): void {
  const teams = program.command("teams").description("Manage teams");

  teams
    .command("list")
    .description("List teams")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${orgId}/teams`
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

  teams
    .command("create")
    .description("Create a new team")
    .requiredOption("--name <name>", "Team name")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(`/orgs/${orgId}/teams`, {
          name: opts.name,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  teams
    .command("get")
    .description("Get team details")
    .argument("<team-id>", "Team ID")
    .option("--org <org-id>", "Organization ID")
    .action(async (teamId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${orgId}/teams/${teamId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  teams
    .command("update")
    .description("Update a team")
    .argument("<team-id>", "Team ID")
    .option("--name <name>", "New name")
    .option("--org <org-id>", "Organization ID")
    .action(async (teamId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        const result = await api.patch(`/orgs/${orgId}/teams/${teamId}`, body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  teams
    .command("delete")
    .description("Delete a team")
    .argument("<team-id>", "Team ID")
    .option("--force", "Skip confirmation")
    .option("--org <org-id>", "Organization ID")
    .action(async (teamId, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete team "${teamId}"? This action cannot be undone.`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        await api.delete(`/orgs/${orgId}/teams/${teamId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Team deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  teams
    .command("members")
    .description("List team members")
    .argument("<team-id>", "Team ID")
    .action(async (teamId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/teams/${teamId}/members`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "userId", header: "USER ID" },
          { key: "role", header: "ROLE" },
          { key: "joinedAt", header: "JOINED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  teams
    .command("member:add")
    .description("Add a member to a team")
    .argument("<team-id>", "Team ID")
    .requiredOption("--user <user-id>", "User ID")
    .action(async (teamId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post(`/teams/${teamId}/members`, {
          userId: opts.user,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  teams
    .command("member:remove")
    .description("Remove a member from a team")
    .argument("<team-id>", "Team ID")
    .argument("<member-id>", "Member ID")
    .action(async (teamId, memberId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        await api.delete(`/teams/${teamId}/members/${memberId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Member removed from team.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
