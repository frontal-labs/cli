import { type SpawnOptions, spawn } from "node:child_process";

/** What a finished child process printed and how it exited. */
export interface BunRun {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface BunRunOptions {
  cwd: string;
  /** Only these variables reach the child. */
  env: Record<string, string>;
  timeoutMs: number;
}

/**
 * Bun intermittently hangs while loading `zod` in a freshly spawned process
 * (about 1 run in 25 here, before any user code runs, and it reproduces on
 * older commits). A child that is silent for this long is killed and started
 * once more.
 */
const SILENT_START_MS = 30_000;

interface Attempt {
  run: BunRun;
  silentHang: boolean;
}

function attempt(args: string[], options: BunRunOptions): Promise<Attempt> {
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    env: options.env,
  };
  return new Promise((resolveRun, reject) => {
    const child = spawn("bun", args, spawnOptions);
    let stdout = "";
    let stderr = "";
    let silentHang = false;
    const watchdog = setTimeout(() => {
      if (stdout === "" && stderr === "") {
        silentHang = true;
        child.kill("SIGKILL");
      }
    }, SILENT_START_MS);
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      clearTimeout(watchdog);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(watchdog);
      resolveRun({
        run: { exitCode: code ?? -1, stderr, stdout },
        silentHang,
      });
    });
  });
}

/**
 * Runs `bun <args>` asynchronously (a blocking spawn would starve an in-process
 * mock server). Retries once when the child hangs silently at start-up.
 */
export async function runBun(
  args: string[],
  options: BunRunOptions
): Promise<BunRun> {
  const first = await attempt(args, options);
  if (!first.silentHang) {
    return first.run;
  }
  return (await attempt(args, options)).run;
}
