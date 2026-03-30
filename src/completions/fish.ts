import type { Command } from "commander";

export function generateFishCompletions(program: Command): string {
  const lines: string[] = [
    "# fish completion for frontal",
    "# Install: frontal completion fish > ~/.config/fish/completions/frontal.fish",
    "",
  ];

  for (const cmd of program.commands) {
    if ((cmd as any)._hidden) {
      continue;
    }
    const name = cmd.name();
    const desc = cmd.description() || name;
    lines.push(
      `complete -c frontal -n "__fish_use_subcommand" -a ${name} -d "${escapeFish(desc)}"`
    );

    for (const sub of cmd.commands) {
      if ((sub as any)._hidden) {
        continue;
      }
      const subDesc = sub.description() || sub.name();
      lines.push(
        `complete -c frontal -n "__fish_seen_subcommand_from ${name}" -a ${sub.name()} -d "${escapeFish(subDesc)}"`
      );
    }

    for (const opt of cmd.options) {
      const optDesc = opt.description || "";
      if (opt.long) {
        const flag = opt.long.replace(/^--/, "");
        lines.push(
          `complete -c frontal -n "__fish_seen_subcommand_from ${name}" -l ${flag} -d "${escapeFish(optDesc)}"`
        );
      }
    }
  }

  // Global options
  for (const opt of program.options) {
    const optDesc = opt.description || "";
    if (opt.long) {
      const flag = opt.long.replace(/^--/, "");
      lines.push(
        `complete -c frontal -n "__fish_use_subcommand" -l ${flag} -d "${escapeFish(optDesc)}"`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

function escapeFish(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
