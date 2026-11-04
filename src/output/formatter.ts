import YAML from "yaml";
import { isJsonRecord, type JsonRecord, jsonFlag } from "@/lib/json.js";
import { redact, redactRecords } from "@/output/redact.js";
import { suppressSpinner } from "@/output/spinner.js";
import { type Column, renderTable } from "@/output/table.js";
import { theme } from "@/output/theme.js";

export interface FormatOptions {
  json?: boolean;
  quiet?: boolean;
  yaml?: boolean;
}

export class Formatter {
  private readonly opts: FormatOptions;

  constructor(opts: FormatOptions) {
    this.opts = opts;
    if (opts.json || opts.quiet) {
      suppressSpinner(true);
    }
  }

  static from(globalOpts: JsonRecord): Formatter {
    return new Formatter({
      json: jsonFlag(globalOpts, "json"),
      quiet: jsonFlag(globalOpts, "quiet"),
      yaml: jsonFlag(globalOpts, "yaml"),
    });
  }

  table(rows: Record<string, unknown>[], columns: Column[]): void {
    const data = redactRecords(rows);
    if (this.opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (this.opts.yaml) {
      console.log(YAML.stringify(data));
      return;
    }
    if (data.length === 0) {
      this.info("No results found.");
      return;
    }
    console.log(renderTable(data, columns));
  }

  object(input: object): void {
    const data = redact(input);
    if (this.opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (this.opts.yaml) {
      console.log(YAML.stringify(data));
      return;
    }
    if (!isJsonRecord(data)) {
      console.log(JSON.stringify(data));
      return;
    }
    for (const [key, value] of Object.entries(data)) {
      let displayValue: string;
      if (value === null || value === undefined) {
        displayValue = theme.dim("-");
      } else if (typeof value === "object") {
        displayValue = JSON.stringify(value);
      } else {
        displayValue = String(value);
      }
      console.log(`${theme.bold(key)}: ${displayValue}`);
    }
  }

  raw(input: unknown): void {
    const data = redact(input);
    if (this.opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (this.opts.yaml) {
      console.log(YAML.stringify(data));
      return;
    }
    if (typeof data === "string") {
      console.log(data);
      return;
    }
    console.log(JSON.stringify(data, null, 2));
  }

  success(msg: string): void {
    if (!this.opts.quiet) {
      console.log(theme.success(msg));
    }
  }

  error(msg: string): void {
    console.error(theme.error(msg));
  }

  warn(msg: string): void {
    if (!this.opts.quiet) {
      console.error(theme.warn(msg));
    }
  }

  info(msg: string): void {
    if (!this.opts.quiet) {
      console.log(theme.dim(msg));
    }
  }
}
