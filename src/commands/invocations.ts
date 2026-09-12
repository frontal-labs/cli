import type { Command } from "commander";
import { assertOperationSupported } from "@/contract/operations.js";
import { runAction } from "@/lib/command.js";
import { withExamples } from "@/lib/output.js";
import { parseJsonInput } from "@/utils/json.js";

export function registerInvocationsCommands(program: Command): void {
  const invocations = program
    .command("invocations")
    .description("Submit runtime invocations");

  withExamples(
    invocations
      .command("create")
      .description("Create an invocation")
      .requiredOption("--body <json>", "Invocation payload JSON")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, sdk }) => {
          assertOperationSupported("POST", "/invocations");
          const body = parseJsonInput(opts.body, "--body");
          const { http } = await sdk();
          const result = await http.post<Record<string, unknown>>(
            "/invocations",
            body
          );
          fmt.raw(result);
        })
      ),
    ['frontal invocations create --body \'{"target":"agent_123","input":{}}\'']
  );
}
