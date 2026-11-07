import type { Command } from "commander";
import { isHiddenCommand } from "@/completions/hidden.js";

export function generateZshCompletions(program: Command): string {
  const commandEntries: string[] = [];
  const subcases: string[] = [];

  for (const cmd of program.commands) {
    if (isHiddenCommand(cmd)) {
      continue;
    }
    const name = cmd.name();
    const desc = cmd.description() || name;
    commandEntries.push(`    '${name}:${escapeZsh(desc)}'`);

    const subs: string[] = [];
    for (const sub of cmd.commands) {
      if (isHiddenCommand(sub)) {
        continue;
      }
      const subDesc = sub.description() || sub.name();
      subs.push(`      '${sub.name()}:${escapeZsh(subDesc)}'`);
    }

    if (subs.length > 0) {
      subcases.push(
        `    ${name})\n      local -a ${name}_cmds\n      ${name}_cmds=(\n${subs.join("\n")}\n      )\n      _describe '${name} command' ${name}_cmds\n      ;;`
      );
    }
  }

  return `#compdef frontal
# Install: frontal completion zsh > ~/.zsh/completions/_frontal
_frontal() {
  local -a commands
  commands=(
${commandEntries.join("\n")}
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  case "\${words[2]}" in
${subcases.join("\n")}
    *)
      ;;
  esac
}
_frontal "$@"
`;
}

const LINE_BREAKS = /[\r\n]+/g;

/**
 * Escapes text for a single-quoted `_describe` entry. Backslashes go first so
 * the escapes added for quotes and colons are not doubled, and line breaks
 * become spaces so a description cannot end the quoted string early.
 */
function escapeZsh(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(LINE_BREAKS, " ");
}
