import type { Command } from "commander";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { classifyError } from "@/errors/handler.js";
import { type CommandContext, runAction } from "@/lib/command.js";
import { tryLoadProjectConfig } from "@/lib/config.js";
import { emitJsonLine, withExamples } from "@/lib/output.js";
import { redact } from "@/output/redact.js";
import { theme } from "@/output/theme.js";

type Obj = Record<string, unknown>;

export interface LogsOptions {
  filter?: string;
  follow?: boolean;
  level?: string;
  limit?: string;
  since?: string;
}

const DURATION = /^(\d+)(ms|s|m|h|d)$/;
const UNIT_MS: Record<string, number> = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  ms: 1,
  s: 1000,
};
const FRACTIONAL_SECONDS = /\.\d+Z$/;
const DEFAULT_SINCE = "15m";
const DEFAULT_LIMIT = 100;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

/** Turns `15m` / `2h` / an ISO timestamp into an ISO timestamp. */
export function sinceToIso(since: string, now = Date.now()): string {
  const match = DURATION.exec(since.trim());
  if (match) {
    const amount = Number(match[1]);
    const unit = UNIT_MS[match[2] as string] as number;
    return new Date(now - amount * unit).toISOString();
  }
  const parsed = Date.parse(since);
  if (Number.isNaN(parsed)) {
    throw new CliError("INVALID_SINCE", `Invalid --since value "${since}".`, {
      exitCode: EXIT_CODES.VALIDATION_ERROR,
      fix: "Use a duration like 15m, 2h, 1d or an ISO-8601 timestamp.",
    });
  }
  return new Date(parsed).toISOString();
}

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  debug: theme.dim,
  error: theme.error,
  warn: theme.warn,
  warning: theme.warn,
};

export function formatLogLine(entry: Obj): string {
  const level = String(entry.level ?? "info");
  const paint = LEVEL_COLORS[level] ?? ((s: string) => s);
  const timestamp = String(entry.timestamp ?? "")
    .replace("T", " ")
    .replace(FRACTIONAL_SECONDS, "");
  const service = entry.service ? theme.dim(String(entry.service)) : "";
  const requestId =
    (entry.metadata as Obj | undefined)?.request_id ??
    (entry.metadata as Obj | undefined)?.requestId ??
    entry.requestId;
  const suffix = requestId ? theme.dim(` (${String(requestId)})`) : "";
  return `${theme.dim(timestamp)} ${paint(level.padEnd(5))} ${service} ${String(entry.message ?? "")}${suffix}`;
}

/** Client-side fallback for servers that ignore the `query` filter. */
export function matchesFilter(entry: Obj, filter: string | undefined): boolean {
  if (!filter || filter === "*") {
    return true;
  }
  return JSON.stringify(entry).toLowerCase().includes(filter.toLowerCase());
}

async function defaultQuery(ctx: CommandContext): Promise<string> {
  const project = await tryLoadProjectConfig({ env: ctx.globalOpts.env });
  return project ? `project:${project.config.name}` : "*";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function shutdownSignal(): AbortSignal {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  return controller.signal;
}

export async function queryLogs(
  ctx: CommandContext,
  opts: LogsOptions
): Promise<void> {
  const { frontal, lastRequestId } = await ctx.sdk();
  const query = opts.filter ?? (await defaultQuery(ctx));
  const page = await frontal.observability.logs.query({
    level: opts.level,
    limit: opts.limit ? Number(opts.limit) : DEFAULT_LIMIT,
    order: "asc",
    query,
    timeFrom: sinceToIso(opts.since ?? DEFAULT_SINCE),
    timeTo: new Date().toISOString(),
  });

  const entries = (page.data as Obj[]).filter((entry) =>
    matchesFilter(entry, opts.filter)
  );
  if (ctx.globalOpts.json) {
    for (const entry of entries) {
      emitJsonLine(entry);
    }
    return;
  }
  if (entries.length === 0) {
    ctx.fmt.info(
      `No log entries for "${query}" in the last ${opts.since ?? DEFAULT_SINCE}.`
    );
    return;
  }
  for (const entry of entries) {
    console.log(formatLogLine(redact(entry) as Obj));
  }
  if (page.pagination.hasMore) {
    ctx.fmt.info("… more entries available (increase --limit).");
  }
  if (lastRequestId) {
    ctx.fmt.info(`request id: ${lastRequestId}`);
  }
}

/**
 * Tails the log stream, reconnecting with backoff on transport errors
 * until interrupted.
 */
interface FollowState {
  attempt: number;
  timeFrom: string;
}

async function consumeStream(
  ctx: CommandContext,
  stream: AsyncIterable<{ data: unknown; id?: string; type: string }>,
  opts: LogsOptions,
  state: FollowState,
  signal: AbortSignal
): Promise<void> {
  const json = Boolean(ctx.globalOpts.json);
  for await (const event of stream) {
    if (signal.aborted) {
      return;
    }
    const entry = (event.data ?? {}) as Obj;
    if (!matchesFilter(entry, opts.filter)) {
      continue;
    }
    if (typeof entry.timestamp === "string") {
      state.timeFrom = entry.timestamp;
    }
    if (json) {
      emitJsonLine({ id: event.id, type: event.type, ...entry });
    } else {
      console.log(formatLogLine(redact(entry) as Obj));
    }
  }
}

function reportReconnect(
  ctx: CommandContext,
  code: string,
  attempt: number,
  delay: number
): void {
  if (ctx.globalOpts.json) {
    emitJsonLine({ attempt, code, delayMs: delay, type: "reconnect" });
  } else if (!ctx.globalOpts.quiet) {
    console.error(
      theme.warn(`stream error (${code}); reconnecting in ${delay}ms`)
    );
  }
}

/**
 * Tails the log stream, reconnecting with backoff on transport errors
 * until interrupted.
 */
export async function followLogs(
  ctx: CommandContext,
  opts: LogsOptions,
  signal = shutdownSignal()
): Promise<void> {
  // A dedicated client wired to the shutdown signal, so aborting ends the
  // open SSE request (the SDK's stream() has no abort parameter itself).
  const { frontal } = await ctx.sdk({ signal });
  const query = opts.filter ?? (await defaultQuery(ctx));
  const state: FollowState = {
    attempt: 0,
    timeFrom: sinceToIso(opts.since ?? "0s"),
  };

  if (!(ctx.globalOpts.json || ctx.globalOpts.quiet)) {
    console.error(theme.dim(`following "${query}" — Ctrl+C to stop`));
  }

  while (!signal.aborted) {
    try {
      const stream = frontal.observability.logs.stream({
        query,
        timeFrom: state.timeFrom,
        timeTo: "now",
        ...(opts.level ? { level: opts.level } : {}),
      } as Parameters<typeof frontal.observability.logs.stream>[0]);
      state.attempt = 0;
      // biome-ignore lint/performance/noAwaitInLoops: reconnect loop
      await consumeStream(ctx, stream, opts, state, signal);
      // Server closed the stream cleanly; reconnect immediately.
    } catch (err) {
      if (signal.aborted) {
        return;
      }
      const report = classifyError(err);
      if (
        report.exitCode === EXIT_CODES.AUTH_ERROR ||
        report.exitCode === EXIT_CODES.PERMISSION_ERROR
      ) {
        throw err;
      }
      state.attempt += 1;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** (state.attempt - 1),
        RECONNECT_MAX_MS
      );
      reportReconnect(ctx, report.code, state.attempt, delay);
      await sleep(delay, signal);
    }
  }
}

export function registerLogsCommand(program: Command): void {
  withExamples(
    program
      .command("logs")
      .description("Query or tail platform logs")
      .option("-f, --follow", "Stream new entries (SSE) until Ctrl+C")
      .option("--filter <query>", "Log query (default: project:<name>)")
      .option(
        "--since <duration>",
        `Look back window, e.g. 15m, 2h, 1d (default ${DEFAULT_SINCE})`
      )
      .option(
        "--level <level>",
        "Only entries at this level (info, warn, error, debug)"
      )
      .option(
        "--limit <n>",
        `Max entries for a query (default ${DEFAULT_LIMIT})`
      )
      .action((opts: LogsOptions, cmd) =>
        runAction(cmd, async (ctx) => {
          if (opts.follow) {
            await followLogs(ctx, opts);
            return;
          }
          await queryLogs(ctx, opts);
        })
      ),
    [
      "frontal logs --since 1h",
      "frontal logs --follow --level error",
      "frontal logs --follow --json | jq -r .requestId",
      "frontal logs --filter 'agent_id:agt_123' --api-url http://localhost:8787/v1",
    ]
  );
}
