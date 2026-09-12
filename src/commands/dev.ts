import type { Command } from "commander";
import type { GlobalOptions } from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { runAction } from "@/lib/command.js";
import { DevServer, type DevServerInfo } from "@/lib/dev/server.js";
import { emitJsonLine, withExamples } from "@/lib/output.js";
import { findProjectRoot } from "@/lib/project.js";
import { theme } from "@/output/theme.js";

export interface DevOptions {
  host?: string;
  persistTo?: string;
  port?: string;
  remote?: string;
  scenario?: string;
  watch?: boolean;
}

export const DEFAULT_DEV_PORT = 8787;

export function parseRemote(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_DEV_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new CliError("INVALID_PORT", `Invalid port "${value}".`, {
      fix: "Use an integer between 0 and 65535 (0 picks a free port).",
      exitCode: EXIT_CODES.VALIDATION_ERROR,
    });
  }
  return port;
}

function serviceSummary(services: Record<string, string>): string {
  const local = Object.entries(services)
    .filter(([, mode]) => mode === "local")
    .map(([name]) => name);
  const remote = Object.entries(services)
    .filter(([, mode]) => mode === "remote")
    .map(([name]) => name);
  const parts: string[] = [];
  if (local.length > 0) {
    parts.push(`${theme.success("[local]")} ${local.join(", ")}`);
  }
  if (remote.length > 0) {
    parts.push(`${theme.warn("[remote]")} ${remote.join(", ")}`);
  }
  return parts.join("  ");
}

export function printReady(info: DevServerInfo): void {
  console.log(
    `${theme.success("frontal dev ready")} on ${theme.bold(info.url)}  ${theme.dim(
      `(${info.routes} routes${info.scenario ? `, scenario: ${info.scenario}` : ""})`
    )}`
  );
  console.log(`  ${serviceSummary(info.services)}`);
  console.log(theme.dim(`  GET ${info.url}/health  ·  Ctrl+C to stop`));
}

/** Waits for SIGINT/SIGTERM, resolving once. */
function waitForShutdown(): Promise<string> {
  return new Promise((resolve) => {
    const onSignal = (signal: string): void => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve(signal);
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

interface DevOutput {
  log?: (line: string) => void;
  ready: (info: DevServerInfo) => void;
  reload: (info: { reason: string; routes: number }) => void;
  stopped: (signal: string) => void;
}

function createOutput(globalOpts: GlobalOptions): DevOutput {
  const json = Boolean(globalOpts.json);
  const quiet = Boolean(globalOpts.quiet);
  const verbose = Boolean(globalOpts.verbose);
  const showLog = json || verbose || !quiet;

  return {
    log: showLog
      ? (line) => {
          if (json) {
            emitJsonLine({ type: "request", line });
          } else {
            console.error(theme.dim(line));
          }
        }
      : undefined,
    ready: (info) => {
      if (json) {
        emitJsonLine({ type: "ready", ...info });
      } else {
        printReady(info);
      }
    },
    reload: (info) => {
      if (json) {
        emitJsonLine({ type: "reload", ...info });
      } else if (!quiet) {
        console.error(
          theme.dim(`reloaded (${info.routes} routes) — ${info.reason}`)
        );
      }
    },
    stopped: (signal) => {
      if (json) {
        emitJsonLine({ type: "stopped", signal });
      } else if (!quiet) {
        console.error(theme.dim(`\nstopped (${signal})`));
      }
    },
  };
}

async function startOrExplain(
  server: DevServer,
  port: number
): Promise<DevServerInfo> {
  try {
    return await server.start();
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "EADDRINUSE"
    ) {
      throw new CliError("PORT_IN_USE", `Port ${port} is already in use.`, {
        fix: "Pass --port <other> or stop the process using it.",
        exitCode: EXIT_CODES.GENERAL_ERROR,
        cause: err,
      });
    }
    throw err;
  }
}

export function registerDevCommand(program: Command): void {
  withExamples(
    program
      .command("dev")
      .description(
        "Run a local Frontal API for this project (no API key needed)"
      )
      .option("--port <port>", "Port to listen on", String(DEFAULT_DEV_PORT))
      .option("--host <host>", "Interface to bind", "127.0.0.1")
      .option("--scenario <name>", "Load .frontal/scenarios/<name>.json routes")
      .option(
        "--remote <services>",
        "Comma-separated services to proxy to the real API (needs credentials)"
      )
      .option("--persist-to <dir>", "State directory (default .frontal/state)")
      .option("--no-watch", "Disable live reload of config and scenarios")
      .action((opts: DevOptions, cmd) =>
        runAction(cmd, async ({ globalOpts }) => {
          const root = findProjectRoot();
          if (!root) {
            throw new CliError(
              "NO_PROJECT",
              "No frontal.jsonc found in this directory or its parents.",
              {
                fix: "Run `frontal init` first, or cd into a Frontal project.",
                exitCode: EXIT_CODES.CONFIG_ERROR,
              }
            );
          }

          const output = createOutput(globalOpts);
          const server = new DevServer({
            root,
            env: globalOpts.env,
            globalOpts,
            port: parsePort(opts.port),
            host: opts.host,
            scenario: opts.scenario,
            remote: parseRemote(opts.remote),
            persistTo: opts.persistTo,
            watch: opts.watch !== false,
            log: output.log,
            onReload: output.reload,
          });

          const info = await startOrExplain(server, parsePort(opts.port));
          output.ready(info);

          const signal = await waitForShutdown();
          await server.stop();
          output.stopped(signal);
        })
      ),
    [
      "frontal dev",
      "frontal dev --port 9000 --scenario deny",
      "frontal dev --remote ai,graph",
      "frontal dev --json | jq -c 'select(.type==\"request\")'",
    ]
  );
}
