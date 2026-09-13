import type { Command } from "commander";
import { assertOperationSupported } from "@/contract/operations.js";
import { paginationParams, runAction } from "@/lib/command.js";
import { withExamples } from "@/lib/output.js";
import { parseJsonInput } from "@/utils/json.js";

export function registerRunsCommands(program: Command): void {
  const runs = program.command("runs").description("List and create runs");

  withExamples(
    runs
      .command("list")
      .description("List runs")
      .option("--limit <n>", "Limit")
      .option("--cursor <cursor>", "Cursor")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("GET", "/runs");
          const { http } = await sdk();
          const result = await http.get<Record<string, unknown>>(
            "/runs",
            paginationParams(opts)
          );
          fmt.raw(result);
        })
      ),
    ["frontal runs list --limit 10"]
  );

  withExamples(
    runs
      .command("create")
      .description("Create a run")
      .requiredOption("--body <json>", "Run payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/runs");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/runs",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal runs create --body \'{"workflowId":"wf_123"}\'']
  );
}
