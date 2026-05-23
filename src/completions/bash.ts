import type { Command, Option } from "commander";

function collectOptionFlags(opts: readonly Option[]): string[] {
  const flags: string[] = [];
  for (const opt of opts) {
    if (opt.long) {
      flags.push(opt.long);
    }
    if (opt.short) {
      flags.push(opt.short);
    }
  }
  return flags;
}

function collectVisibleSubcommandNames(cmds: readonly Command[]): string[] {
  const names: string[] = [];
  for (const cmd of cmds) {
    if ((cmd as { _hidden?: boolean })._hidden) {
      continue;
    }
    names.push(cmd.name());
  }
  return names;
}

export function generateBashCompletions(program: Command): string {
  const topLevel: string[] = [];
  const cases: string[] = [];

  for (const cmd of program.commands) {
    if ((cmd as { _hidden?: boolean })._hidden) {
      continue;
    }
    const name = cmd.name();
    topLevel.push(name);

    const subs = collectVisibleSubcommandNames(cmd.commands);
    const opts = collectOptionFlags(cmd.options);
    const words = [...subs, ...opts].join(" ");

    if (words) {
      cases.push(
        `    ${name})\n      COMPREPLY=( $(compgen -W "${words}" -- "$cur") )\n      ;;`
      );
    }
  }

  const globalOpts = collectOptionFlags(program.options);
  const allTopLevel = [...topLevel, ...globalOpts].join(" ");

  return `# bash completion for frontal
# Install: frontal completion bash >> ~/.bashrc
_frontal() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${allTopLevel}" -- "$cur") )
    return
  fi

  case "\${COMP_WORDS[1]}" in
${cases.join("\n")}
    *)
      ;;
  esac
}
complete -F _frontal frontal
`;
}
