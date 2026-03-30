import type { Command } from "commander";

export function generateZshCompletions(program: Command): string {
  const commandEntries: string[] = [];
  const subcases: string[] = [];

  for (const cmd of program.commands) {
    if ((cmd as any)._hidden) {
      continue;
    }
    const name = cmd.name();
    const desc = cmd.description() || name;
    commandEntries.push(`    '${name}:${escapeZsh(desc)}'`);

    const subs: string[] = [];
    for (const sub of cmd.commands) {
      if ((sub as any)._hidden) {
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

function escapeZsh(str: string): string {
  return str.replace(/'/g, "'\\''").replace(/:/g, "\\:");
}
