import { configManager } from "@/config/manager.js";
import { readCliEnv } from "@/lib/env.js";
import type { DotenvValues } from "@/lib/project.js";

export const DEFAULT_BASE_URL = "https://api.frontal.dev/v1";

export interface GlobalOptions {
  apiKey?: string;
  apiUrl?: string;
  color?: boolean;
  debug?: boolean;
  env?: string;
  json?: boolean;
  org?: string;
  profile?: string;
  quiet?: boolean;
  verbose?: boolean;
  workspace?: string;
  yaml?: boolean;
  yes?: boolean;
}

export interface ResolvedConfig {
  accessToken?: string | undefined;
  apiKey: string;
  authUrl?: string | undefined;
  baseUrl: string;
  debug: boolean;
  orgId?: string | undefined;
  profileName: string;
  refreshToken?: string | undefined;
  tokenExpiresAt?: number | undefined;
  workspaceId?: string | undefined;
}

export interface ProjectOverlay {
  /** Values from the project's `.env.local` (below shell env, above profile). */
  dotenv?: DotenvValues | undefined;
  /** `apiUrl` from `.frontal/config.jsonc` (below `.env.local`, above profile). */
  projectApiUrl?: string;
}

/**
 * Resolves effective settings with precedence
 * flag > shell env > .env.local > .frontal/config.jsonc > profile > default.
 * Credentials are returned raw here; `getSdk()` turns them into an SDK client.
 */
export function resolveConfig(
  opts: GlobalOptions,
  overlay: ProjectOverlay = {}
): ResolvedConfig {
  const profileName =
    opts.profile ??
    readCliEnv().FRONTAL_PROFILE ??
    configManager.getActiveProfileName();
  const profile = configManager.getProfile(profileName);
  const dotenv: DotenvValues = overlay.dotenv ?? {};

  const apiKey =
    opts.apiKey ??
    readCliEnv().FRONTAL_API_KEY ??
    dotenv.FRONTAL_API_KEY ??
    profile.apiKey ??
    "";

  const baseUrl =
    opts.apiUrl ??
    readCliEnv().FRONTAL_API_URL ??
    dotenv.FRONTAL_API_URL ??
    overlay.projectApiUrl ??
    profile.baseUrl ??
    DEFAULT_BASE_URL;

  const orgId = opts.org ?? readCliEnv().FRONTAL_ORG_ID ?? profile.orgId;

  const workspaceId =
    opts.workspace ?? readCliEnv().FRONTAL_WORKSPACE_ID ?? profile.workspaceId;

  const debug = opts.debug ?? profile.debug ?? false;

  return {
    accessToken: profile.accessToken,
    apiKey,
    authUrl: readCliEnv().FRONTAL_AUTH_URL ?? profile.authUrl,
    baseUrl,
    debug,
    orgId,
    profileName,
    refreshToken: profile.refreshToken,
    tokenExpiresAt: profile.tokenExpiresAt,
    workspaceId,
  };
}
