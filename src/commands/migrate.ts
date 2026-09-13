import type { Command } from "commander";
import { configManager } from "@/config/manager.js";
import { handleError } from "@/errors/handler.js";
import { Formatter } from "@/output/formatter.js";

const COMMAND_MAPPING: {
  legacy: string;
  current: string;
  status: string;
}[] = [
  { current: "removed", legacy: "orgs *", status: "not in public API scope" },
  {
    current: "removed",
    legacy: "workspaces *",
    status: "not in public API scope",
  },
  {
    current: "workflows run/get|summary|timeline",
    legacy: "workflows trigger",
    status: "changed",
  },
  {
    current: "removed",
    legacy: "agents *",
    status: "not in Phase 1",
  },
  {
    current: "invocations create",
    legacy: "functions *",
    status: "changed",
  },
  {
    current: "runs *",
    legacy: "pipelines *",
    status: "partially mapped",
  },
  {
    current: "auth mfa <subcommand>",
    legacy: "auth mfa:*",
    status: "renamed",
  },
];

export function registerMigrateCommand(program: Command): void {
  program
    .command("migrate-legacy")
    .description("Map legacy v1 commands to the current CLI")
    .action((_opts, cmd) => {
      try {
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const cfg = configManager.load();

        const checks = {
          activeProfile: cfg.activeProfile,
          hasAccessToken: Boolean(configManager.getProfile().accessToken),
          hasApiKey: Boolean(configManager.getProfile().apiKey),
          profileCount: Object.keys(cfg.profiles).length,
          removedDomains: ["orgs", "workspaces"],
        };

        if (cmd.optsWithGlobals().json || cmd.optsWithGlobals().yaml) {
          fmt.raw({
            checks,
            migration: COMMAND_MAPPING,
          });
          return;
        }

        fmt.table(COMMAND_MAPPING, [
          { header: "LEGACY", key: "legacy" },
          { header: "CURRENT", key: "current" },
          { header: "STATUS", key: "status" },
        ]);
        fmt.object(checks);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
