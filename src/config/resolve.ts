import { configManager } from "@/config/manager.js";

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
  accessToken?: string;
  apiKey: string;
  authUrl?: string;
  baseUrl: string;
  debug: boolean;
  orgId?: string;
  profileName: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  workspaceId?: string;
}

export interface ProjectOverlay {
  /** Values from the project's `.env.local` (below shell env, above profile). */
  dotenv?: Record<string, string>;
  /** `apiUrl` from `frontal.jsonc` (below `.env.local`, above profile). */
  projectApiUrl?: string;
}

/**
 * Resolves effective settings with precedence
 * flag > shell env > .env.local > frontal.jsonc > profile > default.
 * Credentials are returned raw here; `getSdk()` turns them into an SDK client.
 */
export function resolveConfig(
  opts: GlobalOptions,
  overlay: ProjectOverlay = {}
): ResolvedConfig {
  const profileName =
    opts.profile ??
    process.env.FRONTAL_PROFILE ??
    configManager.getActiveProfileName();
  const profile = configManager.getProfile(profileName);
  const dotenv = overlay.dotenv ?? {};

  const apiKey =
    opts.apiKey ??
    process.env.FRONTAL_API_KEY ??
    dotenv.FRONTAL_API_KEY ??
    profile.apiKey ??
    "";

  const baseUrl =
    opts.apiUrl ??
    process.env.FRONTAL_API_URL ??
    dotenv.FRONTAL_API_URL ??
    overlay.projectApiUrl ??
    profile.baseUrl ??
    DEFAULT_BASE_URL;

  const orgId = opts.org ?? process.env.FRONTAL_ORG_ID ?? profile.orgId;

  const workspaceId =
    opts.workspace ?? process.env.FRONTAL_WORKSPACE_ID ?? profile.workspaceId;

  const debug = opts.debug ?? profile.debug ?? false;

  return {
    apiKey,
    baseUrl,
    debug,
    orgId,
    profileName,
    workspaceId,
    accessToken: profile.accessToken,
    refreshToken: profile.refreshToken,
    tokenExpiresAt: profile.tokenExpiresAt,
    authUrl: process.env.FRONTAL_AUTH_URL ?? profile.authUrl,
  };
}
