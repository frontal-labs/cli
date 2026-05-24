import {
  CLI_CLIENT_ID,
  TOKEN_REFRESH_BUFFER_SECONDS,
} from "@/auth/constants.js";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

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
    grant_type: "authorization_code",
    client_id: params.clientId ?? CLI_CLIENT_ID,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(`${params.authUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as Record<string, string>).error_description ??
        (err as Record<string, string>).error ??
        `Token exchange failed (${response.status})`
    );
  }

  const data = (await response.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

export async function refreshTokens(params: {
  authUrl: string;
  clientId?: string;
  refreshToken: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId ?? CLI_CLIENT_ID,
    refresh_token: params.refreshToken,
  });

  const response = await fetch(`${params.authUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as Record<string, string>).error_description ??
        (err as Record<string, string>).error ??
        `Token refresh failed (${response.status})`
    );
  }

  const data = (await response.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
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
    if (parts.length !== 3) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}
