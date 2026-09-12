import { randomUUID } from "node:crypto";
import {
  existsSync,
  type FSWatcher,
  unwatchFile,
  watch,
  watchFile,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import type { GlobalOptions } from "@/config/resolve.js";
import { loadProjectConfig } from "@/lib/config.js";
import { logEntry } from "@/lib/dev/fixtures.js";
import {
  apiError,
  createLocalRoutes,
  emitLog,
  type LocalContext,
} from "@/lib/dev/handlers.js";
import { RemoteProxy, serviceForPath } from "@/lib/dev/proxy.js";
import { type DevRequest, Router, scenarioToRoute } from "@/lib/dev/router.js";
import {
  PROJECT_CONFIG_FILE,
  PROJECT_STATE_DIR,
  SERVICE_KEYS,
  type ServiceKey,
} from "@/lib/project.js";
import { loadScenario, ProjectState } from "@/lib/state.js";

export type ServiceMode = "local" | "remote";

export interface DevServerOptions {
  env?: string;
  globalOpts: GlobalOptions;
  host?: string;
  /** Called for every request log line. */
  log?: (line: string) => void;
  /** Called after a successful live reload. */
  onReload?: (info: { reason: string; routes: number }) => void;
  /** Directory for persisted state (default `.frontal/state`). */
  persistTo?: string;
  port?: number;
  /** Services forced to proxy to the remote API (overrides frontal.jsonc). */
  remote?: string[];
  root: string;
  scenario?: string;
  /** Watch config/scenario files and reload the route table. */
  watch?: boolean;
}

export interface DevServerInfo {
  host: string;
  port: number;
  routes: number;
  scenario?: string;
  services: Record<string, ServiceMode>;
  url: string;
}

interface DevEvent {
  data: unknown;
  type: "reload" | "request";
}

const RELOAD_DEBOUNCE_MS = 100;
const POLL_INTERVAL_MS = 300;

function levelForStatus(status: number): "error" | "info" | "warn" {
  if (status >= 500) {
    return "error";
  }
  return status >= 400 ? "warn" : "info";
}
const V1_PREFIX = /^\/v1(?=\/|$)/;

function requestIdFor(req: IncomingMessage): string {
  const incoming = req.headers["x-request-id"];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && value.length > 0
    ? value
    : `req_dev_${randomUUID().slice(0, 8)}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function parseBody(bytes: Buffer | undefined, contentType: string): unknown {
  if (!bytes || bytes.length === 0) {
    return;
  }
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(bytes.toString("utf-8"));
    } catch {
      return bytes.toString("utf-8");
    }
  }
  if (contentType.startsWith("text/")) {
    return bytes.toString("utf-8");
  }
  return new Uint8Array(bytes);
}

async function writeResponse(
  res: ServerResponse,
  response: Response
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    res.flushHeaders();
  }
  const reader = response.body.getReader();
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: streaming the body is sequential
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!res.write(value)) {
        await new Promise<void>((resolveDrain) =>
          res.once("drain", resolveDrain)
        );
      }
    }
  } catch {
    // Client went away mid-stream; nothing else to do.
  } finally {
    res.end();
  }
}

/**
 * Local Frontal API for `frontal dev`. Serves SDK-compatible fixtures backed
 * by `.frontal/state`, replays scenario routes, and proxies services marked
 * `remote` through the SDK. Runs on `node:http` so it works under Bun and
 * Node alike.
 */
export class DevServer {
  readonly ctx: LocalContext;
  private readonly localRouter = new Router();
  private readonly scenarioRouter = new Router();
  private readonly proxy: RemoteProxy;
  private server?: Server;
  private watchers: FSWatcher[] = [];
  private polledFiles: string[] = [];
  private reloadTimer?: ReturnType<typeof setTimeout>;
  private readonly subscribers = new Set<(event: DevEvent) => void>();
  private readonly scenarioName?: string;

  private readonly options: DevServerOptions;

  constructor(options: DevServerOptions) {
    this.options = options;
    const state = new ProjectState(
      options.root,
      options.persistTo ? resolve(options.root, options.persistTo) : undefined
    );
    this.ctx = {
      env: options.env ?? "dev",
      logSubscribers: new Set(),
      logs: [],
      services: {},
      startedAt: Date.now(),
      state,
    };
    this.proxy = new RemoteProxy(options.globalOpts);
    this.scenarioName = options.scenario;
  }

  get services(): Record<string, ServiceMode> {
    return this.ctx.services;
  }

  get routeCount(): number {
    return this.localRouter.size + this.scenarioRouter.size;
  }

  /** Loads config + scenario and (re)builds the route tables. */
  async load(): Promise<void> {
    const { config } = await loadProjectConfig({
      cwd: this.options.root,
      env: this.options.env,
    });
    const scenario = this.scenarioName
      ? loadScenario(this.options.root, this.scenarioName)
      : undefined;

    const services: Record<string, ServiceMode> = {};
    const forced = new Set(this.options.remote ?? []);
    for (const key of forced) {
      if (!SERVICE_KEYS.includes(key as ServiceKey)) {
        throw new Error(
          `Unknown service "${key}" in --remote. Valid services: ${SERVICE_KEYS.join(", ")}.`
        );
      }
    }
    for (const key of SERVICE_KEYS) {
      const configured = config.services[key];
      const enabled = configured !== undefined || forced.has(key);
      if (!enabled) {
        continue;
      }
      services[key] =
        forced.has(key) || configured?.remote ? "remote" : "local";
    }

    this.ctx.env = config.env;
    this.ctx.services = services;
    this.scenarioRouter.replace((scenario?.routes ?? []).map(scenarioToRoute));
    this.localRouter.replace(createLocalRoutes(this.ctx));
  }

  async start(): Promise<DevServerInfo> {
    await this.load();
    const host = this.options.host ?? "127.0.0.1";
    const server = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(
          JSON.stringify({
            code: "INTERNAL",
            message,
            requestId: requestIdFor(req),
          })
        );
      });
    });
    this.server = server;

    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(this.options.port ?? 8787, host, () => {
        server.off("error", reject);
        resolveListen();
      });
    });

    if (this.options.watch !== false) {
      this.startWatchers();
    }

    return this.info();
  }

  info(): DevServerInfo {
    const address = this.server?.address() as AddressInfo | null;
    const host = this.options.host ?? "127.0.0.1";
    const port = address?.port ?? this.options.port ?? 8787;
    return {
      host,
      port,
      routes: this.routeCount,
      scenario: this.scenarioName,
      services: this.ctx.services,
      url: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    };
  }

  async stop(): Promise<void> {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    for (const file of this.polledFiles) {
      unwatchFile(file);
    }
    this.polledFiles = [];
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    for (const subscriber of this.subscribers) {
      subscriber({ data: { reason: "shutdown" }, type: "reload" });
    }
    const { server } = this;
    if (!server) {
      return;
    }
    await new Promise<void>((resolveClose) => {
      server.closeAllConnections?.();
      server.close(() => resolveClose());
    });
    this.server = undefined;
  }

  /** Re-reads config and scenario files; keeps the old table on failure. */
  async reload(reason: string): Promise<boolean> {
    try {
      await this.load();
    } catch (err) {
      this.options.log?.(
        `reload failed (${reason}): ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
    const info = { reason, routes: this.routeCount };
    this.options.onReload?.(info);
    for (const subscriber of this.subscribers) {
      subscriber({ data: info, type: "reload" });
    }
    return true;
  }

  private startWatchers(): void {
    const { root } = this.options;

    // fs.watch is fast but not reliable everywhere (coalesced or nameless
    // events on macOS, missing on some filesystems). Poll the handful of
    // files that matter as a deterministic fallback.
    const polled = [
      join(root, PROJECT_CONFIG_FILE),
      join(root, ".env.local"),
      ...(this.options.env
        ? [join(root, `frontal.${this.options.env}.jsonc`)]
        : []),
      ...(this.scenarioName
        ? [
            join(
              root,
              PROJECT_STATE_DIR,
              "scenarios",
              `${this.scenarioName}.json`
            ),
          ]
        : []),
    ];
    for (const file of polled) {
      watchFile(
        file,
        { interval: POLL_INTERVAL_MS, persistent: false },
        (curr, prev) => {
          if (curr.mtimeMs !== prev.mtimeMs) {
            this.scheduleReload(file.split("/").pop() ?? file);
          }
        }
      );
      this.polledFiles.push(file);
    }

    const targets = [root, join(root, PROJECT_STATE_DIR, "scenarios")].filter(
      (dir) => existsSync(dir)
    );

    for (const dir of targets) {
      try {
        const watcher = watch(dir, (_event, filename) => {
          const name = String(filename ?? "");
          // Some platforms (macOS FSEvents) omit the filename; reload anyway.
          const relevant =
            name === "" ||
            name === PROJECT_CONFIG_FILE ||
            (name.startsWith("frontal.") && name.endsWith(".jsonc")) ||
            name === ".env.local" ||
            (dir.endsWith("scenarios") && name.endsWith(".json"));
          if (relevant) {
            this.scheduleReload(name || "watch");
          }
        });
        watcher.unref?.();
        this.watchers.push(watcher);
      } catch {
        // fs.watch is best-effort (unsupported filesystems); dev still works.
      }
    }
  }

  private scheduleReload(reason: string): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      this.reload(reason).catch(() => undefined);
    }, RELOAD_DEBOUNCE_MS);
    this.reloadTimer.unref?.();
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const started = performance.now();
    const requestId = requestIdFor(req);
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`
    );
    const path = url.pathname.replace(V1_PREFIX, "") || "/";
    const method = (req.method ?? "GET").toUpperCase();

    const controller = new AbortController();
    res.once("close", () => controller.abort());

    const bytes = await readBody(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }
    const raw = new Request(url, {
      body: bytes && bytes.length > 0 ? bytes : undefined,
      headers,
      method,
      signal: controller.signal,
    });
    const devRequest: DevRequest = {
      body: parseBody(bytes, headers.get("content-type") ?? ""),
      headers,
      method,
      params: {},
      path,
      query: url.searchParams,
      raw,
      requestId,
    };

    const { response, mode, service } = await this.route(devRequest);
    if (!response.headers.has("x-request-id")) {
      response.headers.set("x-request-id", requestId);
    }

    const durationMs = Math.round(performance.now() - started);
    this.record(devRequest, response.status, durationMs, mode, service);
    await writeResponse(res, response);
  }

  private async route(
    req: DevRequest
  ): Promise<{ mode: string; response: Response; service: string }> {
    if (req.path === "/health" && req.method === "GET") {
      const match = this.localRouter.match("GET", "/health");
      const response = match
        ? await match.route.handler(req)
        : apiError(404, "NOT_FOUND", "no health route", req.requestId);
      return { mode: "local", response, service: "dev" };
    }

    if (req.path === "/__dev/events" && req.method === "GET") {
      return { mode: "local", response: this.devEvents(req), service: "dev" };
    }

    const scenario = this.scenarioRouter.match(req.method, req.path);
    if (scenario) {
      req.params = scenario.params;
      return {
        mode: "scenario",
        response: await scenario.route.handler(req),
        service: scenario.route.service ?? "scenario",
      };
    }

    const service = serviceForPath(req.path);
    if (service && this.ctx.services[service] === "remote") {
      return {
        mode: "remote",
        response: await this.proxy.forward(req, service),
        service,
      };
    }

    const local = this.localRouter.match(req.method, req.path);
    if (local) {
      req.params = local.params;
      return {
        mode: "local",
        response: await local.route.handler(req),
        service: local.route.service ?? service ?? "local",
      };
    }

    return {
      mode: "local",
      response: apiError(
        404,
        "NOT_FOUND",
        `No local route for ${req.method} ${req.path}`,
        req.requestId,
        {
          fix: service
            ? `Mark "${service}" as remote (frontal dev --remote ${service}) or add a scenario route.`
            : "Add a scenario route in .frontal/scenarios/<name>.json or check the path.",
        }
      ),
      service: service ?? "unknown",
    };
  }

  private record(
    req: DevRequest,
    status: number,
    durationMs: number,
    mode: string,
    service: string
  ): void {
    const line = `[${req.requestId}] ${req.method} ${req.path} ${status} ${durationMs}ms [${mode}${mode === "local" ? "" : `:${service}`}]`;
    this.options.log?.(line);

    const level = levelForStatus(status);
    if (
      req.path !== "/observability/logs/stream" &&
      req.path !== "/__dev/events"
    ) {
      emitLog(
        this.ctx,
        logEntry(level, `${req.method} ${req.path} ${status}`, {
          duration_ms: durationMs,
          method: req.method,
          mode,
          path: req.path,
          request_id: req.requestId,
          service,
          status,
        })
      );
    }
    for (const subscriber of this.subscribers) {
      subscriber({
        data: {
          durationMs,
          method: req.method,
          mode,
          path: req.path,
          requestId: req.requestId,
          service,
          status,
        },
        type: "request",
      });
    }
  }

  /** `GET /__dev/events`: SSE feed of reloads and requests for tooling. */
  private devEvents(req: DevRequest): Response {
    const encoder = new TextEncoder();
    const { subscribers } = this;
    const { signal } = req.raw;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: DevEvent): void => {
          try {
            controller.enqueue(
              encoder.encode(
                `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
              )
            );
          } catch {
            subscribers.delete(send);
          }
        };
        subscribers.add(send);
        controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
        signal.addEventListener(
          "abort",
          () => {
            subscribers.delete(send);
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
          { once: true }
        );
      },
    });
    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
        "x-request-id": req.requestId,
      },
    });
  }
}
