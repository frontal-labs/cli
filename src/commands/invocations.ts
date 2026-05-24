import type { Command } from "commander";
import { resolveConfig } from "@/config/resolve.js";
import { assertOperationSupported } from "@/contract/operations.js";
import { handleError } from "@/errors/handler.js";
import { ApiClient } from "@/http/client.js";
import { Formatter } from "@/output/formatter.js";
import { parseJsonInput } from "@/utils/json.js";

export function registerInvocationsCommands(program: Command): void {
  const invocations = program
    .command("invocations")
    .description("Submit runtime invocations");

  invocations
    .command("create")
    .description("Create an invocation")
    .requiredOption("--body <json>", "Invocation payload JSON")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/invocations");
        const body = parseJsonInput(opts.body, "--body");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post<Record<string, unknown>>(
          "/invocations",
          body
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
