import type { ScenarioRoute } from "@/lib/state.js";

/**
 * Request as seen by a local route handler. Bodies are pre-parsed JSON for
 * `application/json`, raw bytes otherwise.
 */
export interface DevRequest {
  body: unknown;
  headers: Headers;
  method: string;
  params: Record<string, string>;
  /** Pathname without the `/v1` prefix, e.g. `/agents/agt_1`. */
  path: string;
  query: URLSearchParams;
  raw: Request;
  requestId: string;
}

export type DevHandler = (req: DevRequest) => Response | Promise<Response>;

export interface RouteDefinition {
  handler: DevHandler;
  method: string;
  /**
   * Path pattern. Supports `{param}` / `:param` segments and `*` for the
   * rest of the path. Strings are matched against the full pathname; a
   * RegExp is tested as-is.
   */
  path: string | RegExp;
  /** Service that owns the route (for `[local]`/`[remote]` reporting). */
  service?: string;
  /** Number of times the route may match before it is skipped (scenarios). */
  times?: number;
}

interface CompiledRoute extends RouteDefinition {
  matcher: (pathname: string) => Record<string, string> | undefined;
  remaining: number;
}

const PARAM_SEGMENT =
  /^(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|:([A-Za-z_][A-Za-z0-9_]*))$/;

/**
 * Turns a path pattern into a matcher. Mirrors the semantics of
 * `matchPath` in `@frontal-labs/testing` (suffix match, `{param}`
 * wildcards) so scenario files written for the SDK's test harness work
 * unchanged, and adds named parameter capture for the built-in handlers.
 */
export function compilePath(
  pattern: string | RegExp
): (pathname: string) => Record<string, string> | undefined {
  if (pattern instanceof RegExp) {
    return (pathname) => {
      const match = pattern.exec(pathname);
      return match ? { ...match.groups } : undefined;
    };
  }

  const segments = pattern.split("/").filter(Boolean);
  const wildcard = segments.at(-1) === "*";
  const fixed = wildcard ? segments.slice(0, -1) : segments;

  return (pathname) => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < fixed.length) {
      return;
    }
    if (wildcard) {
      const params = matchSegments(fixed, parts.slice(0, fixed.length));
      if (params) {
        params["*"] = parts.slice(fixed.length).join("/");
      }
      return params;
    }
    // Suffix match: patterns may omit a leading prefix such as `/v1`.
    return matchSegments(fixed, parts.slice(parts.length - fixed.length));
  };
}

function matchSegments(
  segments: string[],
  parts: string[]
): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] as string;
    const part = parts[i] as string;
    const param = PARAM_SEGMENT.exec(segment);
    if (param) {
      params[(param[1] ?? param[2]) as string] = decodeURIComponent(part);
    } else if (segment !== part) {
      return;
    }
  }
  return params;
}

/** Converts a scenario route (JSON) into a route definition. */
export function scenarioToRoute(route: ScenarioRoute): RouteDefinition {
  const path = route.path.startsWith("^") ? new RegExp(route.path) : route.path;
  const headers = { "content-type": "application/json", ...route.headers };
  return {
    method: route.method.toUpperCase(),
    path,
    times: route.times,
    service: "scenario",
    handler: () =>
      new Response(route.body === undefined ? "" : JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers,
      }),
  };
}

/**
 * Ordered route table. Earlier routes win, which lets scenario routes
 * override built-ins.
 */
export class Router {
  private routes: CompiledRoute[] = [];

  constructor(routes: RouteDefinition[] = []) {
    this.replace(routes);
  }

  get size(): number {
    return this.routes.length;
  }

  /** Atomically swaps the route table (used by live reload). */
  replace(routes: RouteDefinition[]): void {
    this.routes = routes.map((route) => ({
      ...route,
      method: route.method.toUpperCase(),
      matcher: compilePath(route.path),
      remaining: route.times ?? Number.POSITIVE_INFINITY,
    }));
  }

  match(
    method: string,
    pathname: string
  ): { params: Record<string, string>; route: RouteDefinition } | undefined {
    const upper = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== upper || route.remaining <= 0) {
        continue;
      }
      const params = route.matcher(pathname);
      if (params) {
        route.remaining -= 1;
        return { route, params };
      }
    }
    return;
  }
}
