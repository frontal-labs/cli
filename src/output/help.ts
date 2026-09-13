import type { Command, Help } from "commander";
import { theme } from "@/output/theme.js";
import { VERSION } from "@/version.js";

/** Runtime the CLI is executing on: Bun (compiled binary / `bun run`) or Node. */
export function runtimeInfo(): {
  arch: string;
  platform: string;
  runtime: "bun" | "node";
  runtimeVersion: string;
} {
  const { bun } = process.versions as { bun?: string };
  return {
    arch: process.arch,
    platform: process.platform,
    runtime: bun ? "bun" : "node",
    runtimeVersion: bun ?? process.version,
  };
}

export function runtimeLabel(): string {
  const info = runtimeInfo();
  return `${info.runtime} ${info.runtimeVersion} · ${info.platform}-${info.arch}`;
}

export function versionLine(): string {
  return `Frontal CLI ${theme.bold(`v${VERSION}`)} ${theme.dim(`(${runtimeLabel()})`)}`;
}

/** Root-help command groups; order is the display order. */
const GROUPS: { commands: string[]; title: string }[] = [
  { commands: ["init", "dev", "types", "env"], title: "Project" },
  { commands: ["deploy", "promote", "rollback"], title: "Deploy" },
  { commands: ["logs", "policy"], title: "Operate" },
  {
    commands: ["workflows", "runs", "invocations", "events"],
    title: "Platform API",
  },
  { commands: ["auth", "config"], title: "Account" },
  { commands: ["completion", "migrate-legacy", "version"], title: "Shell" },
];

const ROOT_EXAMPLES = [
  ["frontal init --name my-app", "scaffold a project"],
  ["frontal dev", "local API, no key needed"],
  ["frontal deploy --preview", "shareable preview URL"],
  ["frontal logs --follow --json", "tail logs as NDJSON"],
  ["frontal <command> --help", "options + examples per command"],
];

const DOCS_URL = "https://github.com/frontal-labs/cli#readme";

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - text.length));
}

function optionRows(cmd: Command, helper: Help): [string, string][] {
  return helper
    .visibleOptions(cmd)
    .map((option) => [
      helper.optionTerm(option),
      helper.optionDescription(option),
    ]);
}

/** Two-column list with a styled term column, wrapped to the terminal. */
function renderRows(
  rows: [string, string][],
  helper: Help,
  styleTerm: (s: string) => string
): string {
  const termWidth = Math.max(...rows.map(([term]) => term.length), 0);
  const width = helper.helpWidth ?? 80;
  const indent = 4;
  const gap = 2;
  const descWidth = Math.max(20, width - indent - termWidth - gap);
  return rows
    .map(([term, description]) => {
      const continuation = " ".repeat(indent + termWidth + gap);
      const wrapped = helper
        .boxWrap(description, descWidth)
        .split("\n")
        .join(`\n${continuation}`);
      return `${" ".repeat(indent)}${styleTerm(pad(term, termWidth))}${" ".repeat(gap)}${wrapped}`;
    })
    .join("\n");
}

/**
 * Root `frontal --help`: banner, usage, grouped commands, global options,
 * examples and docs pointer.
 */
export function formatRootHelp(cmd: Command, helper: Help): string {
  const commands = new Map(
    helper.visibleCommands(cmd).map((sub) => [sub.name(), sub])
  );
  const grouped = new Set<string>();
  const sections: string[] = [];

  sections.push(`  ${versionLine()}`);
  sections.push("");
  sections.push(`  ${theme.header("Usage")}`);
  sections.push(
    `    ${theme.dim("$")} ${theme.bold("frontal")} ${theme.dim("[options]")} ${theme.id("<command>")} ${theme.dim("[subcommand] [args]")}`
  );

  for (const group of GROUPS) {
    const rows: [string, string][] = [];
    for (const name of group.commands) {
      const sub = commands.get(name);
      if (sub) {
        grouped.add(name);
        rows.push([name, helper.subcommandDescription(sub)]);
      }
    }
    if (rows.length > 0) {
      sections.push("");
      sections.push(`  ${theme.header(group.title)}`);
      sections.push(renderRows(rows, helper, theme.id));
    }
  }

  const other: [string, string][] = [];
  for (const [name, sub] of commands) {
    if (!grouped.has(name) && name !== "help") {
      other.push([name, helper.subcommandDescription(sub)]);
    }
  }
  if (other.length > 0) {
    sections.push("");
    sections.push(`  ${theme.header("Other")}`);
    sections.push(renderRows(other, helper, theme.id));
  }

  sections.push("");
  sections.push(`  ${theme.header("Global options")}`);
  sections.push(renderRows(optionRows(cmd, helper), helper, theme.bold));

  sections.push("");
  sections.push(`  ${theme.header("Examples")}`);
  sections.push(
    renderRows(
      ROOT_EXAMPLES.map(([command, note]) => [`$ ${command}`, theme.dim(note)]),
      helper,
      (term) => `${theme.dim("$")} ${theme.id(term.slice(2))}`
    )
  );

  sections.push("");
  sections.push(
    `  ${theme.dim("Docs")}  ${theme.info(DOCS_URL)}   ${theme.dim("·")}   ${theme.dim("Every error prints a code, a fix hint and a docs link.")}`
  );
  sections.push("");
  return `${sections.join("\n")}\n`;
}

/** Styled `Examples:` block appended to a command's help. */
export function formatExamples(examples: string[]): string {
  const lines = examples
    .map((example) => `  ${theme.dim("$")} ${theme.id(example)}`)
    .join("\n");
  return `\n${theme.header("Examples:")}\n${lines}\n`;
}

/**
 * Applies the CLI's help style to a command tree: banner + grouped layout
 * on the root, colored sections on every subcommand.
 */
export function configureHelp(program: Command): void {
  const styles = {
    showGlobalOptions: false,
    sortOptions: false,
    styleArgumentText: (text: string) => theme.id(text),
    styleCommandText: (text: string) => theme.bold(text),
    styleDescriptionText: (text: string) => text,
    styleOptionTerm: (text: string) => theme.bold(text),
    styleSubcommandText: (text: string) => theme.id(text),
    styleTitle: (title: string) => theme.header(title),
  };

  program.configureHelp({
    ...styles,
    formatHelp: (cmd, helper) => formatRootHelp(cmd, helper),
  });

  const visit = (cmd: Command): void => {
    for (const sub of cmd.commands) {
      sub.configureHelp(styles);
      sub.addHelpText(
        "before",
        `${theme.dim(`Frontal CLI v${VERSION}`)} ${theme.dim("·")} ${theme.bold(`frontal ${fullName(sub)}`)}\n`
      );
      sub.addHelpText(
        "after",
        `${theme.dim("Global options (--json, --env, --api-key, --profile, …):")} ${theme.id("frontal --help")}\n`
      );
      visit(sub);
    }
  };
  visit(program);
}

function fullName(cmd: Command): string {
  const names: string[] = [];
  let current: Command | null = cmd;
  while (current?.parent) {
    names.unshift(current.name());
    current = current.parent;
  }
  return names.join(" ");
}
