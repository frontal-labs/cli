import { basename } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { theme } from "../output/theme.js";
import {
  FRAMEWORKS,
  type Framework,
  type FrontalProjectConfig,
  REGIONS,
  SCHEMA_URL,
} from "../schemas/frontal-json.js";
import {
  detectFramework,
  FRAMEWORK_DEFAULTS,
} from "../utils/detect-framework.js";
import {
  frontalJsonExists,
  readFrontalJson,
  writeFrontalJson,
} from "../utils/file.js";
import { isInteractive } from "../utils/interactive.js";

export function registerInitCommands(program: Command): void {
  program
    .command("init")
    .description("Initialize a new Frontal project (creates frontal.json)")
    .option("--name <name>", "Project name")
    .option("--framework <framework>", "Framework")
    .option("--regions <regions>", "Comma-separated regions")
    .option("--build-command <cmd>", "Build command")
    .option("--output-dir <dir>", "Build output directory")
    .option("-y, --yes", "Accept all defaults, skip prompts")
    .action(async (opts, cmd) => {
      try {
        const cwd = process.cwd();

        if (frontalJsonExists(cwd) && !opts.yes) {
          const { confirmAction } = await import("../utils/interactive.js");
          const confirmed = await confirmAction(
            "frontal.json already exists. Overwrite?",
            false
          );
          if (!confirmed) {
            return;
          }
        }

        const detected = await detectFramework(cwd);
        let config: FrontalProjectConfig;

        if (isInteractive() && !opts.yes) {
          config = await interactiveInit(cwd, detected, opts);
        } else {
          config = flagBasedInit(cwd, detected, opts);
        }

        writeFrontalJson(config, cwd);
        console.log(theme.success(`Created frontal.json in ${cwd}`));
        if (detected) {
          console.log(theme.dim(`Detected framework: ${detected}`));
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  program
    .command("validate")
    .description("Validate a frontal.json configuration file")
    .option("--config <path>", "Path to frontal.json", "./frontal.json")
    .action(async (opts, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const configPath =
          opts.config === "./frontal.json"
            ? undefined
            : opts.config.replace(/\/frontal\.json$/, "");

        // Local validation
        const config = readFrontalJson(configPath);
        console.log(theme.success("frontal.json is valid."));

        // Server-side validation if authenticated
        try {
          const resolved = resolveConfig(globalOpts);
          if (resolved.apiKey || resolved.accessToken) {
            const api = new ApiClient(resolved);
            const result = await api.post<{
              valid: boolean;
              errors?: string[];
            }>("/validate", config);
            if (result.valid) {
              console.log(theme.success("Server-side validation passed."));
            } else if (result.errors?.length) {
              console.log(theme.warn("Server-side validation issues:"));
              for (const err of result.errors) {
                console.log(theme.dim(`  - ${err}`));
              }
            }
          }
        } catch {
          // Server validation is optional
        }

        const fmt = Formatter.from(globalOpts);
        if (globalOpts.json || globalOpts.yaml) {
          fmt.object(config as unknown as Record<string, unknown>);
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}

async function interactiveInit(
  cwd: string,
  detected: Framework | undefined,
  opts: Record<string, string | undefined>
): Promise<FrontalProjectConfig> {
  const prompts = await import("@clack/prompts");

  prompts.intro("Frontal project setup");

  const dirName = basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const name = (await prompts.text({
    message: "Project name",
    defaultValue: opts.name ?? dirName,
    placeholder: dirName,
    validate: (val) => {
      if (!(val && /^[a-z0-9-]+$/.test(val))) {
        return "Must be lowercase alphanumeric with hyphens only";
      }
    },
  })) as string;

  if (prompts.isCancel(name)) {
    throw new Error("Setup cancelled.");
  }

  const framework = (await prompts.select({
    message: "Framework",
    initialValue: opts.framework ?? detected ?? "custom",
    options: FRAMEWORKS.map((f) => ({ value: f, label: f })),
  })) as Framework;

  if (prompts.isCancel(framework)) {
    throw new Error("Setup cancelled.");
  }

  const defaults = FRAMEWORK_DEFAULTS[framework];

  const selectedRegions = (await prompts.multiselect({
    message: "Deployment regions",
    options: REGIONS.map((r) => ({ value: r, label: r })),
    required: false,
  })) as string[];

  if (prompts.isCancel(selectedRegions)) {
    throw new Error("Setup cancelled.");
  }

  const buildCommand = (await prompts.text({
    message: "Build command",
    defaultValue: opts.buildCommand ?? defaults.build ?? "",
    placeholder: defaults.build ?? "npm run build",
  })) as string;

  if (prompts.isCancel(buildCommand)) {
    throw new Error("Setup cancelled.");
  }

  const outputDir = (await prompts.text({
    message: "Build output directory",
    defaultValue: opts.outputDir ?? defaults.output,
    placeholder: defaults.output,
  })) as string;

  if (prompts.isCancel(outputDir)) {
    throw new Error("Setup cancelled.");
  }

  prompts.outro("Configuration complete!");

  return {
    $schema: SCHEMA_URL,
    name,
    framework: framework === "custom" ? undefined : framework,
    build: {
      command: buildCommand || undefined,
      outputDirectory: outputDir,
      installCommand: defaults.install,
      devCommand: defaults.dev,
    },
    regions:
      selectedRegions.length > 0
        ? (selectedRegions as (typeof REGIONS)[number][])
        : undefined,
  };
}

function flagBasedInit(
  cwd: string,
  detected: Framework | undefined,
  opts: Record<string, string | undefined>
): FrontalProjectConfig {
  const dirName = basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const name = opts.name ?? dirName;
  const framework = (opts.framework as Framework) ?? detected ?? "custom";
  const defaults = FRAMEWORK_DEFAULTS[framework];
  const regions = opts.regions
    ? (opts.regions
        .split(",")
        .map((r: string) => r.trim()) as (typeof REGIONS)[number][])
    : undefined;

  return {
    $schema: SCHEMA_URL,
    name,
    framework: framework === "custom" ? undefined : framework,
    build: {
      command: opts.buildCommand ?? defaults.build,
      outputDirectory: opts.outputDir ?? defaults.output,
      installCommand: defaults.install,
      devCommand: defaults.dev,
    },
    regions,
  };
}
