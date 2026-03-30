import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { readDefinitionFile } from "../utils/file.js";
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

export function registerPoliciesCommands(program: Command): void {
  const policies = program
    .command("policies")
    .description("Manage access policies");

  policies
    .command("list")
    .description("List policies")
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/orgs/${orgId}/policies`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "effect", header: "EFFECT" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  policies
    .command("create")
    .description("Create a policy from a definition file")
    .requiredOption(
      "--from-file <path>",
      "Path to policy definition file (JSON or YAML)"
    )
    .option("--org <org-id>", "Organization ID")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const definition = readDefinitionFile(opts.fromFile);
        const result = await api.post(`/orgs/${orgId}/policies`, definition);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  policies
    .command("get")
    .description("Get policy details")
    .argument("<policy-id>", "Policy ID")
    .option("--org <org-id>", "Organization ID")
    .action(async (policyId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(`/orgs/${orgId}/policies/${policyId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  policies
    .command("update")
    .description("Update a policy from a definition file")
    .argument("<policy-id>", "Policy ID")
    .requiredOption(
      "--from-file <path>",
      "Path to policy definition file (JSON or YAML)"
    )
    .option("--org <org-id>", "Organization ID")
    .action(async (policyId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        const definition = readDefinitionFile(opts.fromFile);
        const result = await api.patch(
          `/orgs/${orgId}/policies/${policyId}`,
          definition
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  policies
    .command("delete")
    .description("Delete a policy")
    .argument("<policy-id>", "Policy ID")
    .option("--force", "Skip confirmation")
    .option("--org <org-id>", "Organization ID")
    .action(async (policyId, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete policy "${policyId}"? This action cannot be undone.`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const orgId = resolveOrgId(opts, cmd);
        const api = new ApiClient(config);
        await api.delete(`/orgs/${orgId}/policies/${policyId}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Policy deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  policies
    .command("check")
    .description("Check an authorization decision")
    .requiredOption("--subject <subject>", "Subject identifier")
    .requiredOption("--action <action>", "Action to check")
    .requiredOption("--resource <resource>", "Resource identifier")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post("/authorize", {
          subject: opts.subject,
          action: opts.action,
          resource: opts.resource,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
