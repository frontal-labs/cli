import type { Command } from "commander";
import { configManager } from "../config/manager.js";
import { handleError } from "../errors/handler.js";
import { Formatter } from "../output/formatter.js";

const COMMAND_MAPPING: Array<{ legacy: string; v2: string; status: string }> = [
  { legacy: "orgs *", v2: "removed", status: "not in public API scope" },
  {
    legacy: "workspaces *",
    v2: "removed",
    status: "not in public API scope",
  },
  {
    legacy: "workflows trigger",
    v2: "workflows run/get|summary|timeline",
    status: "changed",
  },
  {
    legacy: "agents *",
    v2: "removed",
    status: "not in Phase 1",
  },
  {
    legacy: "functions *",
    v2: "invocations create",
    status: "changed",
  },
  {
    legacy: "pipelines *",
    v2: "runs *",
    status: "partially mapped",
  },
  {
    legacy: "auth mfa:*",
    v2: "auth mfa <subcommand>",
    status: "renamed",
  },
];

export function registerMigrateV2Command(program: Command): void {
  program
    .command("migrate-v2")
    .description("Show v1->v2 command migration guidance")
    .action((_opts, cmd) => {
      try {
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const cfg = configManager.load();

        const checks = {
          activeProfile: cfg.activeProfile,
          profileCount: Object.keys(cfg.profiles).length,
          hasApiKey: Boolean(configManager.getProfile().apiKey),
          hasAccessToken: Boolean(configManager.getProfile().accessToken),
          removedDomains: ["orgs", "workspaces"],
        };

        if (cmd.optsWithGlobals().json || cmd.optsWithGlobals().yaml) {
          fmt.raw({
            migration: COMMAND_MAPPING,
            checks,
          });
          return;
        }

        fmt.table(COMMAND_MAPPING, [
          { key: "legacy", header: "LEGACY" },
          { key: "v2", header: "V2" },
          { key: "status", header: "STATUS" },
        ]);
        fmt.object(checks);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
