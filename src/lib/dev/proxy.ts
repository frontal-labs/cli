import type { GlobalOptions } from "@/config/resolve.js";
import { classifyError } from "@/errors/handler.js";
import { apiError } from "@/lib/dev/handlers.js";
import type { DevRequest } from "@/lib/dev/router.js";
import type { ServiceKey } from "@/lib/project.js";
import { getSdk, type SdkHandle } from "@/lib/sdk.js";

/**
 * Path prefixes owned by each service, used to decide which requests are
 * proxied when a service is marked `remote`.
 */
export const SERVICE_PREFIXES: Record<ServiceKey, string[]> = {
  agents: ["/agents"],
  ai: ["/ai", "/internal/predictions"],
  audit: ["/audit"],
  auth: ["/auth"],
  billing: ["/billing"],
  blob: ["/blob"],
  connectors: ["/connectors"],
  data: ["/data/query", "/data/sql"],
  datasets: ["/data"],
  events: ["/events"],
  governance: ["/policies", "/roles", "/permissions", "/access", "/compliance"],
  graph: ["/ontology/graph"],
  integrations: ["/integrations"],
  lineage: ["/lineage"],
  observability: ["/observability"],
  ontology: ["/ontology"],
  pipelines: ["/pipelines"],
  sandbox: ["/sandbox"],
  schedules: ["/schedules"],
  webhooks: ["/webhooks", "/webhook-endpoints"],
  workers: ["/workers"],
  workflows: ["/workflows"],
};

/** Returns the service that owns `path` (longest prefix wins). */
export function serviceForPath(path: string): ServiceKey | undefined {
  let best: { key: ServiceKey; length: number } | undefined;
  for (const [key, prefixes] of Object.entries(SERVICE_PREFIXES)) {
    for (const prefix of prefixes) {
      if (
        (path === prefix || path.startsWith(`${prefix}/`)) &&
        (!best || prefix.length > best.length)
      ) {
        best = { key: key as ServiceKey, length: prefix.length };
      }
    }
  }
  return best?.key;
}

export const PROXY_HEADER = "x-frontal-dev-proxy";

/**
 * Forwards a request to the real API through the SDK's `HttpClient`, so
 * proxied traffic gets the same auth, retries, and error parsing as any
 * other CLI call. GET/POST/PUT stream the upstream response through; other
 * methods use the typed JSON helpers.
 */
export class RemoteProxy {
  private handle?: Promise<SdkHandle>;
  private readonly globalOpts: GlobalOptions;

  constructor(globalOpts: GlobalOptions) {
    this.globalOpts = globalOpts;
  }

  private sdk(): Promise<SdkHandle> {
    this.handle ??= getSdk(this.globalOpts);
    return this.handle;
  }

  async forward(req: DevRequest, service: string): Promise<Response> {
    let handle: SdkHandle;
    try {
      handle = await this.sdk();
    } catch (err) {
      const report = classifyError(err);
      return apiError(503, report.code, report.message, req.requestId, {
        fix: report.fix,
        service,
      });
    }

    const headers = {
      [PROXY_HEADER]: service,
      "x-request-id": req.requestId,
      ...(req.headers.get("accept")
        ? { Accept: req.headers.get("accept") as string }
        : {}),
    };
    const params = Object.fromEntries(req.query.entries());

    try {
      const upstream = await this.dispatch(handle, req, headers, params);
      return upstream;
    } catch (err) {
      const report = classifyError(err, { requestId: handle.lastRequestId });
      return apiError(
        report.statusCode ?? 502,
        report.code,
        report.message,
        report.requestId ?? req.requestId,
        { fix: report.fix, service, fields: report.fields }
      );
    }
  }

  private async dispatch(
    handle: SdkHandle,
    req: DevRequest,
    headers: Record<string, string>,
    params: Record<string, string>
  ): Promise<Response> {
    const { http } = handle;
    const path = req.path;

    switch (req.method) {
      case "GET": {
        const upstream = await http.getRaw(path, params, headers);
        return passthrough(upstream, req.requestId);
      }
      case "POST": {
        if (req.body instanceof Uint8Array) {
          const form = await req.raw.formData();
          const result = await http.postFormData<unknown>(path, form, headers);
          return jsonResponse(result, req.requestId);
        }
        const upstream = await http.postRaw(path, req.body ?? {}, headers);
        return passthrough(upstream, req.requestId);
      }
      case "PUT": {
        const contentType =
          req.headers.get("content-type") ?? "application/json";
        const body =
          req.body instanceof Uint8Array
            ? Buffer.from(req.body)
            : Buffer.from(JSON.stringify(req.body ?? {}));
        const result = await http.putRaw(path, body, contentType, headers);
        return jsonResponse(result, req.requestId);
      }
      case "PATCH": {
        const result = await http.patch<unknown>(path, req.body ?? {});
        return jsonResponse(result, req.requestId);
      }
      case "DELETE": {
        const result = await http.delete<unknown>(path, params);
        return jsonResponse(result, req.requestId);
      }
      default:
        return apiError(
          405,
          "METHOD_NOT_ALLOWED",
          `${req.method} not supported by the dev proxy`,
          req.requestId
        );
    }
  }
}

function passthrough(upstream: Response, requestId: string): Response {
  const headers = new Headers();
  for (const name of ["content-type", "cache-control", "x-request-id"]) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  headers.set(PROXY_HEADER, "1");
  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", requestId);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

function jsonResponse(result: unknown, requestId: string): Response {
  if (result === undefined) {
    return new Response(null, {
      status: 204,
      headers: { "x-request-id": requestId },
    });
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      [PROXY_HEADER]: "1",
    },
  });
}
