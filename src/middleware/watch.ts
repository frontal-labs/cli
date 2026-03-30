import type { Command } from "commander";
import {
  evaluateCondition,
  parseUntilCondition,
  poll,
} from "../utils/polling.js";

export function installWatchMiddleware(program: Command): void {
  program
    .option("--watch [interval]", "Re-run command at interval (seconds)")
    .option("--until <condition>", "Poll until condition is met (field=value)");

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    const watchInterval = opts.watch;
    const untilExpr = opts.until;

    // Skip if neither --watch nor --until is set, or if the command handles them itself
    if (watchInterval === undefined && !untilExpr) {
      return;
    }

    // Skip for commands that handle their own polling (deploy)
    const commandName = thisCommand.name();
    if (
      [
        "deploy",
        "init",
        "validate",
        "use",
        "auth",
        "config",
        "completion",
      ].includes(commandName)
    ) {
      return;
    }

    // Access Commander's internal _actionHandler (not in public typings)
    const cmd = thisCommand as unknown as Record<string, unknown>;
    const originalAction = cmd._actionHandler as
      | ((...args: unknown[]) => Promise<void>)
      | undefined;
    if (!originalAction) {
      return;
    }

    const condition = untilExpr ? parseUntilCondition(untilExpr) : undefined;
    const interval =
      typeof watchInterval === "string" ? Number(watchInterval) * 1000 : 2000;

    cmd._actionHandler = async (...args: unknown[]) => {
      // Capture console output for condition evaluation
      const originalLog = console.log;
      let lastOutput = "";

      const captureLog = (...logArgs: unknown[]) => {
        const line = logArgs.map(String).join(" ");
        lastOutput += `${line}\n`;
        originalLog(...logArgs);
      };

      const runOnce = async () => {
        lastOutput = "";
        console.log = captureLog;
        try {
          await originalAction.apply(thisCommand, args);
        } finally {
          console.log = originalLog;
        }
      };

      if (condition && !watchInterval) {
        // --until without --watch: silent polling
        for await (const _ of poll(
          async () => {
            await runOnce();
            try {
              const data = JSON.parse(lastOutput.trim());
              return data;
            } catch {
              return {};
            }
          },
          {
            interval,
            until: (data: unknown) => evaluateCondition(data, condition),
          }
        )) {
          // Generator yields each poll result; we continue until condition met
        }
      } else {
        // --watch mode: re-run with clear
        const maxAttempts = condition ? 150 : Number.POSITIVE_INFINITY;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            process.stdout.write("\x1b[2J\x1b[H");
          }

          await runOnce();

          if (condition) {
            try {
              const data = JSON.parse(lastOutput.trim());
              if (evaluateCondition(data, condition)) {
                break;
              }
            } catch {
              // Not JSON, can't evaluate condition
            }
          }

          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      }
    };
  });
}
