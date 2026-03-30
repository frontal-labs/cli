import type { Command } from "commander";

export function generateBashCompletions(program: Command): string {
  const topLevel: string[] = [];
  const cases: string[] = [];

  for (const cmd of program.commands) {
    if ((cmd as any)._hidden) {
      continue;
    }
    const name = cmd.name();
    topLevel.push(name);

    const subs: string[] = [];
    for (const sub of cmd.commands) {
      if ((sub as any)._hidden) {
        continue;
      }
      subs.push(sub.name());
    }

    const opts: string[] = [];
    for (const opt of cmd.options) {
      if (opt.long) {
        opts.push(opt.long);
      }
      if (opt.short) {
        opts.push(opt.short);
      }
    }

    const words = [...subs, ...opts].join(" ");
    if (words) {
      cases.push(
        `    ${name})\n      COMPREPLY=( $(compgen -W "${words}" -- "$cur") )\n      ;;`
      );
    }
  }

  const globalOpts: string[] = [];
  for (const opt of program.options) {
    if (opt.long) {
      globalOpts.push(opt.long);
    }
    if (opt.short) {
      globalOpts.push(opt.short);
    }
  }

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
