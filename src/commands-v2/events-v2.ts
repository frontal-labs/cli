import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { assertOperationSupported } from "../contract/operations.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { parseJsonInput } from "../utils/json.js";

export function registerEventsV2Commands(program: Command): void {
  const events = program.command("events").description("Manage event resources");

  events
    .command("list")
    .description("List events")
    .option("--limit <n>", "Limit")
    .option("--cursor <cursor>", "Cursor")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("GET", "/events");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const params: Record<string, string> = {};
        if (opts.limit) params.limit = String(opts.limit);
        if (opts.cursor) params.cursor = opts.cursor;
        const result = await api.get<Record<string, unknown>>("/events", params);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  events
    .command("get")
    .description("Get event by ID")
    .argument("<id>", "Event ID")
    .action(async (id, _opts, cmd) => {
      try {
        assertOperationSupported("GET", "/events/{id}");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<Record<string, unknown>>(`/events/${id}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  events
    .command("query")
    .description("Query events")
    .requiredOption("--body <json>", "Query payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/events/query");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>("/events/query", body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  events
    .command("usage")
    .description("Create usage event")
    .requiredOption("--body <json>", "Usage payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/events/usage");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>("/events/usage", body);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  events
    .command("reprocess")
    .description("Trigger event reprocessing")
    .requiredOption("--body <json>", "Reprocess payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/events/reprocess");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>(
          "/events/reprocess",
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
