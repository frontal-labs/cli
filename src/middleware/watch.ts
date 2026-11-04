import type { Command } from "commander";
import { jsonField, jsonString } from "@/lib/json.js";
import {
  evaluateCondition,
  parseUntilCondition,
  poll,
} from "@/utils/polling.js";

type ActionHandler = (...args: unknown[]) => Promise<void>;

function isActionHandler(value: unknown): value is ActionHandler {
  return typeof value === "function";
}

/**
 * Commander keeps the command's action in a private field. Read it only when
 * it is present and callable; otherwise there is nothing to wrap.
 */
function readActionHandler(command: Command): ActionHandler | undefined {
  if (!("_actionHandler" in command)) {
    return;
  }
  const value: unknown = command._actionHandler;
  return isActionHandler(value) ? value : undefined;
}

function createCaptureLogger() {
  let lastOutput = "";
  const originalLog = console.log;

  const captureLog = (...logArgs: unknown[]) => {
    const line = logArgs.map(String).join(" ");
    lastOutput += `${line}\n`;
    originalLog(...logArgs);
  };

  return {
    getOutput: () => lastOutput,
    hijack: () => {
      console.log = captureLog;
    },
    resetOutput: () => {
      lastOutput = "";
    },
    restore: () => {
      console.log = originalLog;
    },
  };
}

async function runOnce(
  handler: ActionHandler,
  context: Command,
  args: unknown[],
  capture: ReturnType<typeof createCaptureLogger>
) {
  capture.resetOutput();
  capture.hijack();
  try {
    await handler.apply(context, args);
  } finally {
    capture.restore();
  }
}

function tryParseOutput(output: string): unknown {
  try {
    return JSON.parse(output.trim());
  } catch {
    return {};
  }
}

async function pollUntil(
  handler: ActionHandler,
  context: Command,
  args: unknown[],
  condition: ReturnType<typeof parseUntilCondition>,
  interval: number,
  capture: ReturnType<typeof createCaptureLogger>
) {
  for await (const _ of poll(
    async () => {
      await runOnce(handler, context, args, capture);
      return tryParseOutput(capture.getOutput());
    },
    {
      interval,
      until: (data: unknown) => evaluateCondition(data, condition),
    }
  )) {
    // Generator yields each poll result; we continue until condition met
  }
}

async function watchLoop(
  handler: ActionHandler,
  context: Command,
  args: unknown[],
  condition: ReturnType<typeof parseUntilCondition> | undefined,
  interval: number,
  capture: ReturnType<typeof createCaptureLogger>
) {
  const maxAttempts = condition ? 150 : Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      process.stdout.write("\x1b[2J\x1b[H");
    }

    // biome-ignore lint/performance/noAwaitInLoops: --watch re-runs sequentially
    await runOnce(handler, context, args, capture);

    if (condition) {
      const data = tryParseOutput(capture.getOutput());
      if (evaluateCondition(data, condition)) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export function installWatchMiddleware(program: Command): void {
  program
    .option("--watch [interval]", "Re-run command at interval (seconds)")
    .option("--until <condition>", "Poll until condition is met (field=value)");

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    const watchInterval = jsonField(opts, "watch");
    const untilExpr = jsonString(opts, "until");

    if (watchInterval === undefined && !untilExpr) {
      return;
    }

    const commandName = thisCommand.name();
    if (
      [
        "auth",
        "completion",
        "config",
        "deploy",
        "dev",
        "env",
        "init",
        "logs",
        "policy",
        "promote",
        "rollback",
        "types",
        "use",
        "validate",
      ].includes(commandName)
    ) {
      return;
    }

    const originalAction = readActionHandler(thisCommand);
    if (!originalAction) {
      return;
    }

    const condition = untilExpr ? parseUntilCondition(untilExpr) : undefined;
    const interval =
      typeof watchInterval === "string" ? Number(watchInterval) * 1000 : 2000;

    const wrapped: ActionHandler = async (...args: unknown[]) => {
      const capture = createCaptureLogger();

      if (condition && !watchInterval) {
        await pollUntil(
          originalAction,
          thisCommand,
          args,
          condition,
          interval,
          capture
        );
      } else {
        await watchLoop(
          originalAction,
          thisCommand,
          args,
          condition,
          interval,
          capture
        );
      }
    };
    Object.assign(thisCommand, { _actionHandler: wrapped });
  });
}
