import type { Command } from "commander";

/** True for commands Commander marks hidden (`_hidden`, a private field). */
export function isHiddenCommand(command: Command): boolean {
  return "_hidden" in command && Boolean(command._hidden);
}
