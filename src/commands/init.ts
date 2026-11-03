import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { Command } from "commander";
import { DEFAULT_BASE_URL } from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { runAction } from "@/lib/command.js";
import { SDK_MIN_VERSION } from "@/lib/ontology/generate.js";
import { withExamples } from "@/lib/output.js";
import {
  LEGACY_PROJECT_CONFIG_FILE,
  PROJECT_CONFIG_FILE,
  PROJECT_STATE_DIR,
  renderProjectConfig,
} from "@/lib/project.js";
import { theme } from "@/output/theme.js";
import { VERSION } from "@/version.js";

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const NEWLINE = /\r?\n/;
/** Generated/local-only `.frontal/` subdirectories. Config and ontology stay committed. */
const GITIGNORE_ENTRIES = [
  `${PROJECT_STATE_DIR}/state/`,
  `${PROJECT_STATE_DIR}/build/`,
  `${PROJECT_STATE_DIR}/artifacts/`,
  `${PROJECT_STATE_DIR}/cache/`,
  ".env",
  ".env.local",
];
const BLANKET_STATE_IGNORE = `${PROJECT_STATE_DIR}/`;

export interface InitOptions {
  force?: boolean;
  name?: string;
}

export interface InitResult {
  created: string[];
  dir: string;
  /** Existing files that init never replaces (package.json, src/.gitkeep, .gitignore). */
  kept: string[];
  name: string;
  /** Existing files that would be replaced with --force. */
  skipped: string[];
  updated: string[];
  /** Non-fatal problems the user should fix (e.g. config ignored by .gitignore). */
  warnings: string[];
}

/** Normalizes a directory name into a valid project name. */
export function toProjectName(input: string): string {
  const name = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name.length > 0 ? name : "frontal-app";
}

function renderEnvExample(): string {
  return `# Copy to .env.local (gitignored) and fill in the values.
FRONTAL_API_KEY=
FRONTAL_API_URL=${DEFAULT_BASE_URL}
`;
}

function renderPackageJson(name: string): string {
  return `${JSON.stringify(
    {
      dependencies: { "@frontal-labs/sdk": `^${SDK_MIN_VERSION}` },
      devDependencies: { "frontal-cli": `^${VERSION}` },
      name,
      private: true,
      scripts: {
        deploy: "frontal deploy --preview",
        dev: "frontal dev",
        types: "frontal types",
      },
      type: "module",
      version: "0.1.0",
    },
    null,
    2
  )}\n`;
}

/**
 * Creates a minimal Frontal project. Existing files are never overwritten
 * unless `force` is set; `.gitignore` and an existing `package.json` are
 * left alone apart from the entries Frontal needs.
 */
export function initProject(cwd: string, options: InitOptions): InitResult {
  const dir = options.name ? resolve(cwd, options.name) : resolve(cwd);
  const name = toProjectName(options.name ?? basename(dir));
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new CliError(
      "INVALID_PROJECT_NAME",
      `Invalid project name "${name}".`,
      {
        exitCode: EXIT_CODES.VALIDATION_ERROR,
        fix: "Use lowercase letters, digits and dashes, e.g. --name my-app.",
      }
    );
  }

  const result: InitResult = {
    created: [],
    dir,
    kept: [],
    name,
    skipped: [],
    updated: [],
    warnings: [],
  };
  mkdirSync(dir, { recursive: true });

  const writeFile = (
    relPath: string,
    content: string,
    { overwrite, forceable = true }: { forceable?: boolean; overwrite: boolean }
  ): void => {
    const target = join(dir, relPath);
    if (existsSync(target)) {
      if (!overwrite) {
        (forceable ? result.skipped : result.kept).push(relPath);
        return;
      }
      writeFileSync(target, content);
      result.updated.push(relPath);
      return;
    }
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
    result.created.push(relPath);
  };

  const force = Boolean(options.force);
  // A pre-existing root frontal.jsonc keeps being the config (never a second one).
  const configPath =
    !existsSync(join(dir, PROJECT_CONFIG_FILE)) &&
    existsSync(join(dir, LEGACY_PROJECT_CONFIG_FILE))
      ? LEGACY_PROJECT_CONFIG_FILE
      : PROJECT_CONFIG_FILE;
  writeFile(configPath, renderProjectConfig(name), {
    overwrite: force,
  });
  writeFile(".env.example", renderEnvExample(), { overwrite: force });
  writeFile(join("src", ".gitkeep"), "", {
    forceable: false,
    overwrite: false,
  });
  // package.json is only ever created, never replaced (even with --force).
  writeFile("package.json", renderPackageJson(name), {
    forceable: false,
    overwrite: false,
  });

  const gitignore = join(dir, ".gitignore");
  const existing = existsSync(gitignore)
    ? readFileSync(gitignore, "utf-8")
    : "";
  const lines = existing.split(NEWLINE);
  if (lines.some((line) => line.trim() === BLANKET_STATE_IGNORE)) {
    result.warnings.push(
      `.gitignore ignores ${BLANKET_STATE_IGNORE} entirely, so ${PROJECT_CONFIG_FILE} and the generated ontology files will not be committed. Replace "${BLANKET_STATE_IGNORE}" with the entries listed in ${PROJECT_STATE_DIR}/state/ etc.`
    );
  }
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.includes(entry));
  if (missing.length > 0) {
    const prefix =
      existing.length === 0 || existing.endsWith("\n")
        ? existing
        : `${existing}\n`;
    writeFileSync(
      gitignore,
      `${prefix}${existing.length === 0 ? "" : "\n"}# Frontal\n${missing.join("\n")}\n`
    );
    (existing.length === 0 ? result.created : result.updated).push(
      ".gitignore"
    );
  } else {
    result.kept.push(".gitignore");
  }

  return result;
}

/** Human-readable summary of an init run, followed by next steps. */
function printInitResult(result: InitResult): void {
  for (const file of result.created) {
    console.log(`${theme.success("create")}  ${file}`);
  }
  for (const file of result.updated) {
    console.log(`${theme.warn("update")}  ${file}`);
  }
  for (const file of result.skipped) {
    console.log(
      `${theme.dim("skip")}    ${file} ${theme.dim("(exists, use --force)")}`
    );
  }
  for (const file of result.kept) {
    console.log(`${theme.dim("keep")}    ${file} ${theme.dim("(exists)")}`);
  }
  for (const warning of result.warnings) {
    console.log(`${theme.warn("warn")}    ${warning}`);
  }

  const rel = relative(process.cwd(), result.dir);
  console.log("");
  console.log(theme.bold("Next steps:"));
  if (rel !== "") {
    console.log(`  cd ${rel}`);
  }
  console.log("  frontal dev          # local server, no API key needed");
  console.log(
    "  frontal env pull     # write .env.local from .frontal/config.jsonc"
  );
  console.log(
    "  frontal sync         # download the ontology and generate types"
  );
  console.log(
    "  frontal types        # generate src/frontal-configuration.d.ts"
  );
}

export function registerInitCommand(program: Command): void {
  withExamples(
    program
      .command("init")
      .description(
        "Create a new Frontal project (.frontal/config.jsonc, .env.example)"
      )
      .option(
        "--name <dir>",
        "Directory to create (defaults to the current directory)"
      )
      .option("--force", "Overwrite existing project config / .env.example")
      .action((opts: InitOptions, cmd) =>
        runAction(cmd, ({ fmt, globalOpts }) => {
          const result = initProject(process.cwd(), opts);

          if (globalOpts.json) {
            fmt.raw(result);
            return;
          }

          printInitResult(result);
        })
      ),
    [
      "frontal init --name my-app",
      "frontal init --force",
      "frontal init --json",
    ]
  );
}
