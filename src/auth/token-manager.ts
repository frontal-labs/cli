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
    const err = (await response.json().catch(() => ({}))) as Partial<
      Record<string, string>
    >;
    throw new Error(
      err.error_description ??
        err.error ??
        `Token exchange failed (${response.status})`
    );
  }

  const data = (await response.json()) as TokenResponse;
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
    const err = (await response.json().catch(() => ({}))) as Partial<
      Record<string, string>
    >;
    throw new Error(
      err.error_description ??
        err.error ??
        `Token refresh failed (${response.status})`
    );
  }

  const data = (await response.json()) as TokenResponse;
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
