import type { Command } from "commander";
import { assertOperationSupported } from "@/contract/operations.js";
import { paginationParams, runAction } from "@/lib/command.js";
import { withExamples } from "@/lib/output.js";
import { parseJsonInput } from "@/utils/json.js";

// The SDK's events package models topics/subscriptions; the public
// `/events` inventory endpoints are called through the generic HTTP client.
export function registerEventsCommands(program: Command): void {
  const events = program
    .command("events")
    .description("List, query and reprocess events");

  withExamples(
    events
      .command("list")
      .description("List events")
      .option("--limit <n>", "Limit")
      .option("--cursor <cursor>", "Cursor")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("GET", "/events");
          const { http } = await sdk();
          const result = await http.get<Record<string, unknown>>(
            "/events",
            paginationParams(opts)
          );
          fmt.raw(result);
        })
      ),
    ["frontal events list --limit 20 --json"]
  );

  withExamples(
    events
      .command("get")
      .description("Get event by ID")
      .argument("<id>", "Event ID")
      .action((id, _opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("GET", "/events/{id}");
          const { http } = await sdk();
          const result = await http.get<Record<string, unknown>>(
            `/events/${encodeURIComponent(id)}`
          );
          fmt.raw(result);
        })
      ),
    ["frontal events get evt_123"]
  );

  withExamples(
    events
      .command("query")
      .description("Query events")
      .requiredOption("--body <json>", "Query payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/events/query");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/events/query",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal events query --body \'{"type":"agent.run.completed"}\'']
  );

  withExamples(
    events
      .command("usage")
      .description("Create usage event")
      .requiredOption("--body <json>", "Usage payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/events/usage");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/events/usage",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal events usage --body \'{"metric":"tokens","value":120}\'']
  );

  withExamples(
    events
      .command("reprocess")
      .description("Trigger event reprocessing")
      .requiredOption("--body <json>", "Reprocess payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/events/reprocess");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/events/reprocess",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal events reprocess --body \'{"ids":["evt_123"]}\'']
  );
}
