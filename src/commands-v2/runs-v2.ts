import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { assertOperationSupported } from "../contract/operations.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { parseJsonInput } from "../utils/json.js";

export function registerRunsV2Commands(program: Command): void {
  const runs = program.command("runs").description("Manage run resources");

  runs
    .command("list")
    .description("List runs")
    .option("--limit <n>", "Limit")
    .option("--cursor <cursor>", "Cursor")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("GET", "/runs");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const params: Record<string, string> = {};
        if (opts.limit) {
          params.limit = String(opts.limit);
        }
        if (opts.cursor) {
          params.cursor = opts.cursor;
        }
        const result = await api.get<Record<string, unknown>>("/runs", params);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  runs
    .command("create")
    .description("Create a run")
    .requiredOption("--body <json>", "Run payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/runs");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>("/runs", body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
