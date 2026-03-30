import type { Command } from "commander";
import { configManager } from "../config/manager.js";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { confirmAction } from "../utils/interactive.js";

export function registerOrgsCommands(program: Command): void {
  const orgs = program.command("orgs").description("Manage organizations");

  orgs
    .command("list")
    .description("List all organizations")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/orgs"
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "slug", header: "SLUG" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("create")
    .description("Create a new organization")
    .requiredOption("--name <name>", "Organization name")
    .option("--slug <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const body: Record<string, unknown> = { name: opts.name };
        if (opts.slug) {
          body.slug = opts.slug;
        }
        const result = await api.post("/orgs", body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("get")
    .description("Get organization details")
    .argument("[org-id]", "Organization ID (defaults to config)")
    .action(async (orgId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const id = orgId ?? config.orgId;
        if (!id) {
          throw new Error(
            "Organization ID required. Provide as argument or set via `orgs use`."
          );
        }
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${id}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("update")
    .description("Update an organization")
    .argument("<org-id>", "Organization ID")
    .option("--name <name>", "New name")
    .action(async (orgId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        const result = await api.patch(`/orgs/${orgId}`, body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("use")
    .description("Set the active organization")
    .argument("<org-id>", "Organization ID")
    .action(async (orgId, _opts, cmd) => {
      try {
        const profileName =
          cmd.optsWithGlobals().profile ?? configManager.getActiveProfileName();
        configManager.setProfile(profileName, { orgId });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success(`Active organization set to "${orgId}".`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("members")
    .description("List organization members")
    .argument("[org-id]", "Organization ID (defaults to config)")
    .action(async (orgId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const id = orgId ?? config.orgId;
        if (!id) {
          throw new Error(
            "Organization ID required. Provide as argument or set via `orgs use`."
          );
        }
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${id}/members`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "email", header: "EMAIL" },
          { key: "role", header: "ROLE" },
          { key: "joinedAt", header: "JOINED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("member:add")
    .description("Add a member to an organization")
    .argument("<org-id>", "Organization ID")
    .requiredOption("--email <email>", "Member email")
    .requiredOption("--role <role>", "Member role")
    .action(async (orgId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post(`/orgs/${orgId}/members`, {
          email: opts.email,
          role: opts.role,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("member:get")
    .description("Get details of an organization member")
    .argument("<org-id>", "Organization ID")
    .argument("<member-id>", "Member ID")
    .action(async (orgId, memberId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${orgId}/members/${memberId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("member:update")
    .description("Update an organization member's role")
    .argument("<org-id>", "Organization ID")
    .argument("<member-id>", "Member ID")
    .requiredOption("--role <role>", "New role")
    .action(async (orgId, memberId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.patch(`/orgs/${orgId}/members/${memberId}`, {
          role: opts.role,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("member:remove")
    .description("Remove a member from an organization")
    .argument("<org-id>", "Organization ID")
    .argument("<member-id>", "Member ID")
    .option("--force", "Skip confirmation")
    .action(async (orgId, memberId, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Remove member "${memberId}" from organization "${orgId}"?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        await api.delete(`/orgs/${orgId}/members/${memberId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Member removed.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("activity")
    .description("View organization activity log")
    .argument("[org-slug]", "Organization slug (defaults to config)")
    .action(async (orgSlug, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = orgSlug ?? config.orgId;
        if (!slug) {
          throw new Error(
            "Organization slug required. Provide as argument or set via `orgs use`."
          );
        }
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/activity`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "action", header: "ACTION" },
          { key: "actor", header: "ACTOR" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("quota")
    .description("View organization quota")
    .argument("[org-id]", "Organization ID (defaults to config)")
    .action(async (orgId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const id = orgId ?? config.orgId;
        if (!id) {
          throw new Error(
            "Organization ID required. Provide as argument or set via `orgs use`."
          );
        }
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${id}/quota`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("quota:update")
    .description("Update organization quota")
    .argument("<org-id>", "Organization ID")
    .requiredOption("--key <key>", "Quota key")
    .requiredOption("--value <value>", "Quota value")
    .action(async (orgId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.patch(`/orgs/${orgId}/quota`, {
          [opts.key]: opts.value,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("usage")
    .description("View organization usage")
    .argument("[org-id]", "Organization ID (defaults to config)")
    .action(async (orgId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const id = orgId ?? config.orgId;
        if (!id) {
          throw new Error(
            "Organization ID required. Provide as argument or set via `orgs use`."
          );
        }
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${id}/usage`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("relationships")
    .description("List organization relationships")
    .argument("[org-id]", "Organization ID (defaults to config)")
    .action(async (orgId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const id = orgId ?? config.orgId;
        if (!id) {
          throw new Error(
            "Organization ID required. Provide as argument or set via `orgs use`."
          );
        }
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${id}/relationships`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "type", header: "TYPE" },
          { key: "targetId", header: "TARGET ID" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("relationship:create")
    .description("Create an organization relationship")
    .argument("<org-id>", "Organization ID")
    .requiredOption("--type <type>", "Relationship type")
    .requiredOption("--target <target-id>", "Target ID")
    .action(async (orgId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post(`/orgs/${orgId}/relationships`, {
          type: opts.type,
          targetId: opts.target,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  orgs
    .command("relationship:delete")
    .description("Delete an organization relationship")
    .argument("<org-id>", "Organization ID")
    .argument("<rel-id>", "Relationship ID")
    .action(async (orgId, relId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        await api.delete(`/orgs/${orgId}/relationships/${relId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Relationship deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
