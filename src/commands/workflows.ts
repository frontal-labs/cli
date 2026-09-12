import type { Command } from "commander";
import { assertOperationSupported } from "@/contract/operations.js";
import { paginationParams, runAction } from "@/lib/command.js";
import { emitJsonLine, withExamples } from "@/lib/output.js";
import { renderSSEStream } from "@/output/stream.js";
import { parseJsonInput } from "@/utils/json.js";

export function registerWorkflowsCommands(program: Command): void {
  const workflows = program
    .command("workflows")
    .description("Manage workflow resources from public API");

  withExamples(
    workflows
      .command("list")
      .description("List workflows")
      .option("--limit <n>", "Limit")
      .option("--cursor <cursor>", "Cursor")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("GET", "/workflows");
          const { frontal } = await sdk();
          const page = await frontal.workflows.list(paginationParams(opts));
          fmt.raw({ data: page.data, pagination: page.pagination });
        })
      ),
    ["frontal workflows list --limit 10", "frontal workflows list --json"]
  );

  withExamples(
    workflows
      .command("create")
      .description("Create a workflow")
      .requiredOption("--body <json>", "Workflow definition JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/workflows");
          const body = parseJsonInput(opts.body, "--body");
          const { frontal } = await sdk();
          // The SDK validates the definition against WorkflowDefinitionSchema.
          const result = await frontal.workflows.create(
            body as Parameters<typeof frontal.workflows.create>[0]
          );
          fmt.object(result as unknown as Record<string, unknown>);
        })
      ),
    ['frontal workflows create --body \'{"name":"nightly","steps":[]}\'']
  );

  withExamples(
    workflows
      .command("search")
      .description("Search workflows")
      .requiredOption("--body <json>", "Search payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/workflows/search");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/workflows/search",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal workflows search --body \'{"query":"nightly"}\'']
  );

  withExamples(
    workflows
      .command("batch")
      .description("Batch workflow operation")
      .requiredOption("--body <json>", "Batch payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/workflows/batch");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/workflows/batch",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal workflows batch --body \'{"ids":["wf_1"],"action":"pause"}\'']
  );

  const run = workflows.command("run").description("Inspect workflow runs");

  withExamples(
    run
      .command("get")
      .description("Get workflow run")
      .argument("<workflow-id>", "Workflow ID")
      .argument("<run-id>", "Run ID")
      .action((workflowId, runId, _opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("GET", "/workflows/{workflow_id}/{run_id}");
          const { frontal } = await sdk();
          const result = await frontal.workflows
            .use(workflowId)
            .execution(runId);
          fmt.raw(result);
        })
      ),
    ["frontal workflows run get wf_123 run_456"]
  );

  withExamples(
    run
      .command("summary")
      .description("Get workflow run summary")
      .argument("<workflow-id>", "Workflow ID")
      .argument("<run-id>", "Run ID")
      .action((workflowId, runId, _opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported(
            "GET",
            "/workflows/{workflow_id}/{run_id}/summary"
          );
          const { frontal } = await sdk();
          const result = await frontal.workflows
            .use(workflowId)
            .executionSummary(runId);
          fmt.raw(result);
        })
      ),
    ["frontal workflows run summary wf_123 run_456"]
  );

  withExamples(
    run
      .command("timeline")
      .description("Stream workflow run timeline events (SSE)")
      .argument("<workflow-id>", "Workflow ID")
      .argument("<run-id>", "Run ID")
      .action((workflowId, runId, _opts, cmd) =>
        runAction(cmd, async ({ globalOpts, sdk }) => {
          assertOperationSupported(
            "GET",
            "/workflows/{workflow_id}/{run_id}/timeline"
          );
          const { frontal } = await sdk();
          const events = frontal.workflows.use(workflowId).watch(runId);
          if (globalOpts.json) {
            for await (const event of events) {
              emitJsonLine(event);
            }
            return;
          }
          await renderSSEStream(events, { quiet: globalOpts.quiet });
        })
      ),
    ["frontal workflows run timeline wf_123 run_456 --json | jq .data"]
  );
}
