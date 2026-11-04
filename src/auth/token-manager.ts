import { z } from "zod";
import {
  CLI_CLIENT_ID,
  TOKEN_REFRESH_BUFFER_SECONDS,
} from "@/auth/constants.js";

/** OAuth error bodies (RFC 6749 section 5.2). Anything else is ignored. */
const oauthErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/** Reads the OAuth error message from an untrusted response body. */
async function readOAuthError(response: Response): Promise<{
  error?: string | undefined;
  error_description?: string | undefined;
}> {
  const raw: unknown = await response.json().catch(() => ({}));
  const parsed = oauthErrorSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** A successful token response. Anything missing or mistyped is an error. */
const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
});

export interface TokenSet {
  accessToken: string;
  expiresAt: number; // Unix epoch seconds
  refreshToken: string | undefined;
}

export async function exchangeCode(params: {
  authUrl: string;
  clientId?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: params.clientId ?? CLI_CLIENT_ID,
    code: params.code,
    code_verifier: params.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
  });

  const response = await fetch(`${params.authUrl}/oauth/token`, {
    body: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    const err = await readOAuthError(response);
    throw new Error(
      err.error_description ??
        err.error ??
        `Token exchange failed (${response.status})`
    );
  }

  const data = tokenResponseSchema.parse(await response.json());
  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    refreshToken: data.refresh_token,
  };
}

export async function refreshTokens(params: {
  authUrl: string;
  clientId?: string;
  refreshToken: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: params.clientId ?? CLI_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const response = await fetch(`${params.authUrl}/oauth/token`, {
    body: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    const err = await readOAuthError(response);
    throw new Error(
      err.error_description ??
        err.error ??
        `Token refresh failed (${response.status})`
    );
  }

  const data = tokenResponseSchema.parse(await response.json());
  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    refreshToken: data.refresh_token,
  };
}

export function isTokenExpired(
  expiresAt: number,
  bufferSeconds?: number
): boolean {
  const buffer = bufferSeconds ?? TOKEN_REFRESH_BUFFER_SECONDS;
  return Date.now() / 1000 >= expiresAt - buffer;
}

export function decodeTokenExpiry(jwt: string): number | null {
  try {
    const parts = jwt.split(".");
    const [, encodedPayload] = parts;
    if (parts.length !== 3 || encodedPayload === undefined) {
      return null;
    }
    const raw: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8")
    );
    const parsed = z.object({ exp: z.number() }).safeParse(raw);
    return parsed.success ? parsed.data.exp : null;
  } catch {
    return null;
  }
}
