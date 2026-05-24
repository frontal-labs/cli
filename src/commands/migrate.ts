import type { Command } from "commander";
import { configManager } from "@/config/manager.js";
import { handleError } from "@/errors/handler.js";
import { Formatter } from "@/output/formatter.js";

const COMMAND_MAPPING: {
  legacy: string;
  current: string;
  status: string;
}[] = [
  { legacy: "orgs *", current: "removed", status: "not in public API scope" },
  {
    legacy: "workspaces *",
    current: "removed",
    status: "not in public API scope",
  },
  {
    legacy: "workflows trigger",
    current: "workflows run/get|summary|timeline",
    status: "changed",
  },
  {
    legacy: "agents *",
    current: "removed",
    status: "not in Phase 1",
  },
  {
    legacy: "functions *",
    current: "invocations create",
    status: "changed",
  },
  {
    legacy: "pipelines *",
    current: "runs *",
    status: "partially mapped",
  },
  {
    legacy: "auth mfa:*",
    current: "auth mfa <subcommand>",
    status: "renamed",
  },
];

export function registerMigrateCommand(program: Command): void {
  program
    .command("migrate-legacy")
    .description("Show v1->current command migration guidance")
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
          { key: "current", header: "CURRENT" },
          { key: "status", header: "STATUS" },
        ]);
        fmt.object(checks);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
