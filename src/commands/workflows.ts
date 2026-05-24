import type { Command } from "commander";
import { resolveConfig } from "@/config/resolve.js";
import { assertOperationSupported } from "@/contract/operations.js";
import { handleError } from "@/errors/handler.js";
import { ApiClient } from "@/http/client.js";
import { Formatter } from "@/output/formatter.js";
import { parseJsonInput } from "@/utils/json.js";

export function registerWorkflowsCommands(program: Command): void {
  const workflows = program
    .command("workflows")
    .description("Manage workflow resources from public API");

  workflows
    .command("list")
    .description("List workflows")
    .option("--limit <n>", "Limit")
    .option("--cursor <cursor>", "Cursor")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("GET", "/workflows");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const params: Record<string, string> = {};
        if (opts.limit) {
          params.limit = String(opts.limit);
        }
        if (opts.cursor) {
          params.cursor = opts.cursor;
        }
        const result = await api.get<Record<string, unknown>>(
          "/workflows",
          params
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("create")
    .description("Create a workflow")
    .requiredOption("--body <json>", "Workflow payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/workflows");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>(
          "/workflows",
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("search")
    .description("Search workflows")
    .requiredOption("--body <json>", "Search payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/workflows/search");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>(
          "/workflows/search",
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("batch")
    .description("Batch workflow operation")
    .requiredOption("--body <json>", "Batch payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/workflows/batch");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>(
          "/workflows/batch",
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  const run = workflows.command("run").description("Inspect workflow runs");

  run
    .command("get")
    .description("Get workflow run")
    .argument("<workflow-id>", "Workflow ID")
    .argument("<run-id>", "Run ID")
    .action(async (workflowId, runId, _opts, cmd) => {
      try {
        assertOperationSupported("GET", "/workflows/{workflow_id}/{run_id}");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<Record<string, unknown>>(
          `/workflows/${workflowId}/${runId}`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  run
    .command("summary")
    .description("Get workflow run summary")
    .argument("<workflow-id>", "Workflow ID")
    .argument("<run-id>", "Run ID")
    .action(async (workflowId, runId, _opts, cmd) => {
      try {
        assertOperationSupported(
          "GET",
          "/workflows/{workflow_id}/{run_id}/summary"
        );
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<Record<string, unknown>>(
          `/workflows/${workflowId}/${runId}/summary`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  run
    .command("timeline")
    .description("Get workflow run timeline")
    .argument("<workflow-id>", "Workflow ID")
    .argument("<run-id>", "Run ID")
    .action(async (workflowId, runId, _opts, cmd) => {
      try {
        assertOperationSupported(
          "GET",
          "/workflows/{workflow_id}/{run_id}/timeline"
        );
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<Record<string, unknown>>(
          `/workflows/${workflowId}/${runId}/timeline`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
