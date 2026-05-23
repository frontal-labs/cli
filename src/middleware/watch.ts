import type { Command } from "commander";
import {
  evaluateCondition,
  parseUntilCondition,
  poll,
} from "../utils/polling.js";

type ActionHandler = (...args: unknown[]) => Promise<void>;

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
    resetOutput: () => {
      lastOutput = "";
    },
    hijack: () => {
      console.log = captureLog;
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
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      process.stdout.write("\x1b[2J\x1b[H");
    }

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
    const watchInterval = opts.watch;
    const untilExpr = opts.until;

    if (watchInterval === undefined && !untilExpr) {
      return;
    }

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

    const cmd = thisCommand as unknown as Record<string, unknown>;
    const originalAction = cmd._actionHandler as ActionHandler | undefined;
    if (!originalAction) {
      return;
    }

    const condition = untilExpr ? parseUntilCondition(untilExpr) : undefined;
    const interval =
      typeof watchInterval === "string" ? Number(watchInterval) * 1000 : 2000;

    cmd._actionHandler = async (...args: unknown[]) => {
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
  });
}
