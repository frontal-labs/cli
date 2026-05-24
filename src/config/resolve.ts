import { configManager } from "@/config/manager.js";
import type { ApiClientConfig } from "@/http/client.js";

const DEFAULT_BASE_URL = "https://api.frontal.dev/v1";

export interface GlobalOptions {
  apiKey?: string;
  apiUrl?: string;
  color?: boolean;
  debug?: boolean;
  json?: boolean;
  org?: string;
  profile?: string;
  quiet?: boolean;
  verbose?: boolean;
  workspace?: string;
  yaml?: boolean;
}

export interface ResolvedConfig extends ApiClientConfig {
  accessToken?: string;
  authUrl?: string;
  orgId?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  workspaceId?: string;
}

export function resolveConfig(opts: GlobalOptions): ResolvedConfig {
  const profileName = opts.profile ?? process.env.FRONTAL_PROFILE ?? undefined;
  const profile = configManager.getProfile(profileName);

  const apiKey =
    opts.apiKey ?? process.env.FRONTAL_API_KEY ?? profile.apiKey ?? "";

  const baseUrl =
    opts.apiUrl ??
    process.env.FRONTAL_API_URL ??
    profile.baseUrl ??
    DEFAULT_BASE_URL;

  const orgId = opts.org ?? process.env.FRONTAL_ORG_ID ?? profile.orgId;

  const workspaceId =
    opts.workspace ?? process.env.FRONTAL_WORKSPACE_ID ?? profile.workspaceId;

  const debug = opts.debug ?? profile.debug ?? false;

  const accessToken = profile.accessToken;
  const refreshToken = profile.refreshToken;
  const tokenExpiresAt = profile.tokenExpiresAt;
  const authUrl = process.env.FRONTAL_AUTH_URL ?? profile.authUrl;

  return {
    apiKey,
    baseUrl,
    debug,
    orgId,
    workspaceId,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    authUrl,
  };
}
