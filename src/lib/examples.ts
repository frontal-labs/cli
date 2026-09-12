import type { Command } from "commander";
import { withExamples } from "@/lib/output.js";

/**
 * `--help` examples for commands registered by the pre-SDK command modules.
 * New commands attach examples directly with `withExamples()`.
 */
export const COMMAND_EXAMPLES: Record<string, string[]> = {
  "auth login": [
    "frontal auth login",
    "frontal auth login --method api-key --profile staging",
  ],
  "auth logout": [
    "frontal auth logout",
    "frontal auth logout --profile staging",
  ],
  "auth mfa backup-codes-regenerate": [
    "frontal auth mfa backup-codes-regenerate --json",
  ],
  "auth mfa disable": ["frontal auth mfa disable --code 123456"],
  "auth mfa enable": ["frontal auth mfa enable --code 123456"],
  "auth mfa setup": ["frontal auth mfa setup"],
  "auth mfa status": ["frontal auth mfa status --json"],
  "auth mfa verify": ["frontal auth mfa verify --code 123456"],
  "auth password-login": [
    "frontal auth password-login --email dev@example.com --password '***'",
  ],
  "auth refresh": ["frontal auth refresh --json"],
  "auth signup": [
    "frontal auth signup --email dev@example.com --password '***'",
  ],
  "auth token": ["frontal auth token | pbcopy"],
  "completion bash": [
    "frontal completion bash > /etc/bash_completion.d/frontal",
  ],
  "completion fish": [
    "frontal completion fish > ~/.config/fish/completions/frontal.fish",
  ],
  "completion zsh": ["frontal completion zsh > ~/.zsh/completions/_frontal"],
  "config get": ["frontal config get baseUrl"],
  "config list": ["frontal config list", "frontal config list --json"],
  "config profiles": ["frontal config profiles"],
  "config reset": ["frontal config reset --yes"],
  "config set": [
    "frontal config set baseUrl https://api.staging.frontal.dev/v1",
    "frontal config set debug true --profile staging",
  ],
  "config telemetry disable": ["frontal config telemetry disable"],
  "config telemetry enable": ["frontal config telemetry enable"],
  "config telemetry status": ["frontal config telemetry status --json"],
  "config use": ["frontal config use staging"],
  "migrate-legacy": ["frontal migrate-legacy", "frontal migrate-legacy --json"],
};

function walk(
  cmd: Command,
  path: string[],
  visit: (c: Command, p: string[]) => void
): void {
  for (const sub of cmd.commands) {
    const next = [...path, sub.name()];
    visit(sub, next);
    walk(sub, next, visit);
  }
}

/** Attaches `COMMAND_EXAMPLES` to the matching commands in the tree. */
export function applyCommandExamples(program: Command): void {
  walk(program, [], (cmd, path) => {
    const examples = COMMAND_EXAMPLES[path.join(" ")];
    if (examples) {
      withExamples(cmd, examples);
    }
  });
}
