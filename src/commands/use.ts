import type { Command } from "commander";
import { configManager } from "../config/manager.js";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { theme } from "../output/theme.js";

export function registerUseCommand(program: Command): void {
  program
    .command("use")
    .description("Switch organization and workspace context")
    .argument("<context>", "Organization ID, or org/workspace")
    .action(async (context: string, _opts, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const resolved = resolveConfig(globalOpts);
        const api = new ApiClient(resolved);

        const parts = context.split("/");
        const orgId = parts[0];
        const workspaceId = parts[1] || undefined;

        if (!orgId) {
          throw new Error(
            "Usage: frontal use <org> or frontal use <org>/<workspace>"
          );
        }

        // Validate org exists
        const org = await api.get<Record<string, unknown>>(`/orgs/${orgId}`);
        const orgName = (org.name as string) ?? orgId;

        // Validate workspace if provided
        let wsName: string | undefined;
        if (workspaceId) {
          const ws = await api.get<Record<string, unknown>>(
            `/orgs/${orgId}/workspaces/${workspaceId}`
          );
          wsName = (ws.name as string) ?? workspaceId;
        }

        // Save to active profile
        const profileName =
          globalOpts.profile ?? configManager.getActiveProfileName();
        configManager.setProfile(profileName, {
          orgId,
          workspaceId,
        });

        if (wsName) {
          console.log(
            theme.success(
              `Switched to org "${orgName}" / workspace "${wsName}"`
            )
          );
        } else {
          console.log(theme.success(`Switched to org "${orgName}"`));
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
