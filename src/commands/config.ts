import type { Command } from "commander";
import { configManager } from "@/config/manager.js";
import { handleError } from "@/errors/handler.js";
import { Formatter } from "@/output/formatter.js";
import { theme } from "@/output/theme.js";
import { confirmAction } from "@/utils/interactive.js";

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Manage CLI configuration");

  config
    .command("set")
    .description("Set a configuration value")
    .argument("<key>", "Config key (e.g., defaults.outputFormat)")
    .argument("<value>", "Config value")
    .action((key, value, _opts, cmd) => {
      try {
        const cfg = configManager.load();
        setNestedValue(cfg, key, parseValue(value));
        configManager.save(cfg);
        console.log(theme.success(`Set ${key} = ${value}`));
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  config
    .command("get")
    .description("Get a configuration value")
    .argument("<key>", "Config key")
    .action((key, _opts, cmd) => {
      try {
        const cfg = configManager.load();
        const value = getNestedValue(cfg, key);
        console.log(
          value === undefined ? theme.dim("(not set)") : String(value)
        );
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  config
    .command("list")
    .description("Display all configuration for active profile")
    .action((_opts, cmd) => {
      try {
        const cfg = configManager.load();
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object({
          schemaVersion: cfg.schemaVersion,
          activeProfile: cfg.activeProfile,
          telemetryEnabled: cfg.telemetry.enabled,
          profiles: Object.keys(cfg.profiles).join(", ") || "(none)",
          ...cfg.defaults,
          ...configManager.getProfile(),
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  config
    .command("reset")
    .description("Reset configuration to defaults")
    .option("--force", "Skip confirmation")
    .action(async (opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          "Reset all configuration to defaults?",
          opts.force
        );
        if (!confirmed) {
          return;
        }

        configManager.save({
          schemaVersion: 2,
          activeProfile: "default",
          profiles: {},
          telemetry: { enabled: false },
          defaults: { outputFormat: "table", paginationLimit: 25 },
        });
        console.log(theme.success("Configuration reset to defaults."));
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  config
    .command("profiles")
    .description("List all profiles")
    .action((_opts, cmd) => {
      try {
        const cfg = configManager.load();
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const profiles = Object.keys(cfg.profiles).map((name) => ({
          name,
          active: name === cfg.activeProfile ? "*" : "",
          apiKey: cfg.profiles[name].apiKey
            ? `${cfg.profiles[name].apiKey?.slice(0, 7)}...`
            : "(not set)",
          baseUrl: cfg.profiles[name].baseUrl ?? "(default)",
        }));
        fmt.table(profiles, [
          { key: "active", header: "" },
          { key: "name", header: "PROFILE" },
          { key: "apiKey", header: "API KEY" },
          { key: "baseUrl", header: "BASE URL" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  config
    .command("use")
    .description("Switch active profile")
    .argument("<profile>", "Profile name")
    .action((profile, _opts, cmd) => {
      try {
        configManager.setActiveProfile(profile);
        console.log(theme.success(`Switched to profile "${profile}".`));
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  const telemetry = config
    .command("telemetry")
    .description("Manage CLI telemetry consent");

  telemetry
    .command("enable")
    .description("Enable telemetry")
    .action((_opts, cmd) => {
      try {
        const cfg = configManager.load();
        cfg.telemetry.enabled = true;
        configManager.save(cfg);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object({ telemetry: "enabled" });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  telemetry
    .command("disable")
    .description("Disable telemetry")
    .action((_opts, cmd) => {
      try {
        const cfg = configManager.load();
        cfg.telemetry.enabled = false;
        configManager.save(cfg);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object({ telemetry: "disabled" });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  telemetry
    .command("status")
    .description("Show telemetry consent status")
    .action((_opts, cmd) => {
      try {
        const cfg = configManager.load();
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object({ telemetryEnabled: cfg.telemetry.enabled });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === undefined) {
      continue;
    }
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const last = parts.at(-1);
  if (!last) {
    return;
  }
  current[last] = value;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function parseValue(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") {
    return num;
  }
  return value;
}
