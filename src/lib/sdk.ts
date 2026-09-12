import type { FrontalClient, HttpClient } from "@frontal-labs/core";
import type { Frontal } from "@frontal-labs/sdk";
import { isTokenExpired, refreshTokens } from "@/auth/token-manager.js";
import { configManager } from "@/config/manager.js";
import {
  type GlobalOptions,
  type ResolvedConfig,
  resolveConfig,
} from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { redactString } from "@/output/redact.js";
import { theme } from "@/output/theme.js";
import { VERSION } from "@/version.js";

export type Credential =
  | { kind: "api-key"; apiKey: string }
  | {
      accessToken: string;
      authUrl?: string;
      expiresAt?: number;
      kind: "oauth";
      profileName: string;
      refreshToken?: string;
    }
  | { kind: "anonymous" };

export interface SdkHandle {
  baseUrl: string;
  client: FrontalClient;
  credential: Credential;
  frontal: Frontal;
  /** Generic HTTP access for endpoints the SDK does not model yet. */
  http: HttpClient;
  /** `X-Request-Id` of the most recent response, for error reporting. */
  lastRequestId?: string;
}

export interface GetSdkOptions {
  /** Build a client without credentials (signup, password login). */
  anonymous?: boolean;
}

type SdkModule = typeof import("@frontal-labs/sdk");
type CoreModule = typeof import("@frontal-labs/core");

// Placeholder keys satisfy the SDK's `frt_` validation; the real credential
// is injected per request by `createAuthFetch`.
const OAUTH_PLACEHOLDER_KEY = "frt_oauth_session_placeholder";
const ANONYMOUS_PLACEHOLDER_KEY = "frt_anonymous_placeholder";

const API_KEY_PATTERN = /^(frt_[A-Za-z0-9_-]+|fr_typed[A-Za-z0-9_]+)$/;
const SDK_ENV_VALUES = new Set(["development", "test", "production"]);
const DEBUG_VALUES = new Set(["true", "false", "1", "0"]);

const ENV_TO_SDK_ENVIRONMENT: Record<string, string> = {
  dev: "development",
  development: "development",
  test: "test",
  staging: "staging",
  prod: "production",
  production: "production",
};

let sdkModulePromise: Promise<SdkModule> | undefined;
let coreModulePromise: Promise<CoreModule> | undefined;

/**
 * `@frontal-labs/core` validates `FRONTAL_*` environment variables at import
 * time and throws on invalid values. The CLI has already read what it needs,
 * so strip anything the SDK would reject before loading it.
 */
export function sanitizeSdkEnv(): void {
  const env = process.env;
  // Assigning `undefined` stores the string "undefined"; delete instead.
  const drop = (key: string) => Reflect.deleteProperty(env, key);

  if (env.FRONTAL_ENV !== undefined && !SDK_ENV_VALUES.has(env.FRONTAL_ENV)) {
    drop("FRONTAL_ENV");
  }
  if (env.FRONTAL_API_KEY !== undefined) {
    const key = env.FRONTAL_API_KEY;
    if (key.length < 9 || key.length > 128 || !API_KEY_PATTERN.test(key)) {
      drop("FRONTAL_API_KEY");
    }
  }
  if (env.FRONTAL_API_URL !== undefined && !isUrl(env.FRONTAL_API_URL)) {
    drop("FRONTAL_API_URL");
  }
  if (env.FRONTAL_DEBUG !== undefined && !DEBUG_VALUES.has(env.FRONTAL_DEBUG)) {
    drop("FRONTAL_DEBUG");
  }
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function getSdkModule(): Promise<SdkModule> {
  sanitizeSdkEnv();
  sdkModulePromise ??= import("@frontal-labs/sdk");
  return sdkModulePromise;
}

export function getCoreModule(): Promise<CoreModule> {
  sanitizeSdkEnv();
  coreModulePromise ??= import("@frontal-labs/core");
  return coreModulePromise;
}

/**
 * Picks the credential to use: explicit API key (flag/env/profile) wins,
 * then a stored OAuth session.
 */
export function resolveCredential(
  config: ResolvedConfig
): Credential | undefined {
  if (config.apiKey) {
    return { kind: "api-key", apiKey: config.apiKey };
  }
  if (config.accessToken) {
    return {
      kind: "oauth",
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.tokenExpiresAt,
      authUrl: config.authUrl,
      profileName: config.profileName,
    };
  }
  return;
}

export function mapEnvironment(env: string | undefined): string {
  if (!env) {
    return "production";
  }
  return ENV_TO_SDK_ENVIRONMENT[env] ?? env;
}

interface AuthFetchHooks {
  /** Transport to use for the actual request (defaults to global fetch). */
  fetch?: typeof fetch;
  onRequestId?: (requestId: string) => void;
}

/**
 * Wraps `fetch` so OAuth sessions and anonymous calls work with an SDK that
 * only knows about `frt_` API keys. The SDK's `Authorization` header is
 * replaced (or removed) per request; expired tokens are refreshed and
 * persisted to the profile.
 */
export function createAuthFetch(
  credential: Credential,
  hooks: AuthFetchHooks = {}
): typeof fetch {
  let session = credential.kind === "oauth" ? { ...credential } : undefined;
  let refreshing: Promise<void> | undefined;
  const transport = hooks.fetch ?? fetch;

  const refresh = async (): Promise<void> => {
    if (!session) {
      return;
    }
    if (!(session.refreshToken && session.authUrl)) {
      throw new CliError(
        "TOKEN_EXPIRED",
        "Your session has expired and cannot be refreshed.",
        {
          fix: "Run `frontal auth login` to sign in again.",
          exitCode: EXIT_CODES.AUTH_ERROR,
        }
      );
    }
    const tokens = await refreshTokens({
      authUrl: session.authUrl,
      refreshToken: session.refreshToken,
    });
    session = {
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    configManager.setProfile(session.profileName, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    });
  };

  const ensureFresh = async (): Promise<void> => {
    if (!(session?.expiresAt && isTokenExpired(session.expiresAt))) {
      return;
    }
    refreshing ??= refresh().finally(() => {
      refreshing = undefined;
    });
    await refreshing;
  };

  const withAuthHeader = (init: RequestInit | undefined): RequestInit => {
    const headers = new Headers(init?.headers);
    if (session) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    } else if (credential.kind === "anonymous") {
      headers.delete("Authorization");
    }
    return { ...init, headers };
  };

  return async (input, init) => {
    await ensureFresh();
    let response = await transport(input, withAuthHeader(init));

    if (response.status === 401 && session?.refreshToken) {
      await refresh();
      response = await transport(input, withAuthHeader(init));
    }

    const requestId = response.headers.get("x-request-id");
    if (requestId) {
      hooks.onRequestId?.(requestId);
    }
    return response;
  };
}

/**
 * Single factory for SDK access. Resolves credentials, validates the client
 * config with the SDK's own schema and returns the unified `Frontal` client
 * alongside the generic HTTP client.
 */
export async function getSdk(
  globalOpts: GlobalOptions,
  options: GetSdkOptions = {}
): Promise<SdkHandle> {
  const config = resolveConfig(globalOpts);
  const credential: Credential | undefined = options.anonymous
    ? { kind: "anonymous" }
    : resolveCredential(config);

  if (!credential) {
    throw new CliError("NO_CREDENTIALS", "No credentials configured.", {
      fix: "Run `frontal auth login`, or set FRONTAL_API_KEY (or pass --api-key).",
      exitCode: EXIT_CODES.AUTH_ERROR,
    });
  }

  return await createSdkHandle({
    credential,
    baseUrl: config.baseUrl,
    environment: mapEnvironment(globalOpts.env ?? process.env.FRONTAL_ENV),
    debug: config.debug,
    verbose: Boolean(globalOpts.verbose || process.env.FRONTAL_DEBUG === "1"),
  });
}

export interface CreateSdkHandleInput {
  baseUrl: string;
  credential: Credential;
  debug?: boolean;
  environment?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  timeout?: number;
  verbose?: boolean;
}

export async function createSdkHandle(
  input: CreateSdkHandleInput
): Promise<SdkHandle> {
  const [sdk, core] = await Promise.all([getSdkModule(), getCoreModule()]);

  const handle: Partial<SdkHandle> = {
    baseUrl: input.baseUrl,
    credential: input.credential,
  };

  const authFetch = createAuthFetch(input.credential, {
    fetch: input.fetch,
    onRequestId: (id) => {
      handle.lastRequestId = id;
    },
  });

  const apiKey = apiKeyFor(input.credential);
  const logger = input.verbose ? createVerboseLogger() : undefined;

  const parsed = core.clientConfigSchema.safeParse({
    apiKey,
    baseUrl: input.baseUrl,
    environment: input.environment ?? "production",
    debug: input.debug ?? false,
    headers: { "X-Frontal-Cli": VERSION },
    fetch: authFetch,
    ...(input.timeout === undefined ? {} : { timeout: input.timeout }),
    ...(input.maxRetries === undefined ? {} : { maxRetries: input.maxRetries }),
    ...(logger ? { logger } : {}),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "config";
    throw new CliError(
      "CONFIG_INVALID",
      `Invalid SDK configuration (${field}): ${issue?.message ?? "unknown"}`,
      {
        fix:
          field === "apiKey"
            ? "API keys must start with `frt_`. Check FRONTAL_API_KEY, --api-key or your profile."
            : "Check --api-url / FRONTAL_API_URL and your profile settings with `frontal config list`.",
        exitCode: EXIT_CODES.CONFIG_ERROR,
        cause: parsed.error,
      }
    );
  }

  const client = new core.FrontalClient(parsed.data);
  const frontal = new sdk.Frontal(client);

  handle.client = client;
  handle.frontal = frontal;
  handle.http = client.httpClient;
  return handle as SdkHandle;
}

function apiKeyFor(credential: Credential): string {
  switch (credential.kind) {
    case "api-key":
      return credential.apiKey;
    case "oauth":
      return OAUTH_PLACEHOLDER_KEY;
    default:
      return ANONYMOUS_PLACEHOLDER_KEY;
  }
}

function createVerboseLogger() {
  return {
    request: (method: unknown, url: unknown) => {
      console.error(theme.dim(`→ ${String(method)} ${String(url)}`));
    },
    response: (res: unknown) => {
      if (res instanceof Response) {
        const id = res.headers.get("x-request-id");
        console.error(
          theme.dim(`← ${res.status} ${res.url}${id ? ` (${id})` : ""}`)
        );
      }
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(theme.dim(`✗ ${redactString(message)}`));
    },
  };
}
