import type { Command } from "commander";
import { formatExamples } from "@/output/help.js";
import { redact } from "@/output/redact.js";

/** Writes a JSON document to stdout with secrets removed. */
export function emitJson(data: unknown): void {
  console.log(JSON.stringify(redact(data), null, 2));
}

/** Writes a single NDJSON line to stdout with secrets removed. */
export function emitJsonLine(data: unknown): void {
  console.log(JSON.stringify(redact(data)));
}

/** Appends an `Examples:` block to a command's `--help` output. */
export function withExamples(cmd: Command, examples: string[]): Command {
  return cmd.addHelpText("after", formatExamples(examples));
}
