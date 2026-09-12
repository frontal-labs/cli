import { createMockFetch } from "@frontal-labs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configManager } from "@/config/manager.js";
import { resolveConfig } from "@/config/resolve.js";
import { CliError } from "@/errors/cli-error.js";
import {
  createAuthFetch,
  createSdkHandle,
  getSdk,
  mapEnvironment,
  resolveCredential,
  sanitizeSdkEnv,
} from "@/lib/sdk.js";
import { TEST_API_KEY, TEST_BASE_URL } from "../helpers/cli.js";

const BEARER_JWT = /^Bearer .+\..+\..+$/;

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url"
  );
  const payload = Buffer.from(JSON.stringify({ exp, sub: "user_1" })).toString(
    "base64url"
  );
  return `${header}.${payload}.signature_signature`;
}

describe("sanitizeSdkEnv", () => {
  it("drops values the SDK would reject at import time", () => {
    process.env.FRONTAL_ENV = "dev";
    process.env.FRONTAL_API_KEY = "not-a-key";
    process.env.FRONTAL_API_URL = "nope";
    process.env.FRONTAL_DEBUG = "yes";

    sanitizeSdkEnv();

    expect(process.env.FRONTAL_ENV).toBeUndefined();
    expect(process.env.FRONTAL_API_KEY).toBeUndefined();
    expect(process.env.FRONTAL_API_URL).toBeUndefined();
    expect(process.env.FRONTAL_DEBUG).toBeUndefined();
  });

  it("keeps valid values", () => {
    process.env.FRONTAL_ENV = "production";
    process.env.FRONTAL_API_KEY = TEST_API_KEY;
    process.env.FRONTAL_API_URL = TEST_BASE_URL;
    process.env.FRONTAL_DEBUG = "1";

    sanitizeSdkEnv();

    expect(process.env.FRONTAL_ENV).toBe("production");
    expect(process.env.FRONTAL_API_KEY).toBe(TEST_API_KEY);
    expect(process.env.FRONTAL_API_URL).toBe(TEST_BASE_URL);
    expect(process.env.FRONTAL_DEBUG).toBe("1");
  });
});

describe("resolveCredential precedence", () => {
  beforeEach(() => {
    configManager.setProfile("default", {
      accessToken: undefined,
      apiKey: undefined,
      authUrl: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
    });
    configManager.setActiveProfile("default");
  });

  it("prefers --api-key over FRONTAL_API_KEY over the profile", () => {
    process.env.FRONTAL_API_KEY = "frt_from_env_000000";
    configManager.setProfile("default", { apiKey: "frt_from_profile_00" });

    expect(
      resolveCredential(resolveConfig({ apiKey: "frt_from_flag_0000" }))
    ).toEqual({ apiKey: "frt_from_flag_0000", kind: "api-key" });
    expect(resolveCredential(resolveConfig({}))).toEqual({
      apiKey: "frt_from_env_000000",
      kind: "api-key",
    });

    delete process.env.FRONTAL_API_KEY;
    expect(resolveCredential(resolveConfig({}))).toEqual({
      apiKey: "frt_from_profile_00",
      kind: "api-key",
    });
  });

  it("falls back to the stored OAuth session", () => {
    configManager.setProfile("default", {
      accessToken: "token-abc",
      authUrl: "https://auth.test.frontal.dev",
      refreshToken: "refresh-abc",
      tokenExpiresAt: 123,
    });

    expect(resolveCredential(resolveConfig({}))).toEqual({
      accessToken: "token-abc",
      authUrl: "https://auth.test.frontal.dev",
      expiresAt: 123,
      kind: "oauth",
      profileName: "default",
      refreshToken: "refresh-abc",
    });
  });

  it("returns undefined without credentials", () => {
    expect(resolveCredential(resolveConfig({}))).toBeUndefined();
  });
});

describe("mapEnvironment", () => {
  it("maps CLI env names to SDK environment names", () => {
    expect(mapEnvironment(undefined)).toBe("production");
    expect(mapEnvironment("dev")).toBe("development");
    expect(mapEnvironment("staging")).toBe("staging");
    expect(mapEnvironment("prod")).toBe("production");
  });
});

describe("createAuthFetch", () => {
  it("injects the OAuth bearer token in place of the SDK placeholder", async () => {
    const mock = createMockFetch([
      { body: { ok: true }, method: "GET", path: "/ping" },
    ]);
    const authFetch = createAuthFetch(
      {
        accessToken: jwtWithExp(Math.floor(Date.now() / 1000) + 3600),
        kind: "oauth",
        profileName: "default",
      },
      { fetch: mock.fetch }
    );

    await authFetch("https://api.test.frontal.dev/v1/ping", {
      headers: { Authorization: "Bearer frt_placeholder_000000" },
    });

    const request = mock.expectCalled("GET", "/ping");
    expect(request.headers.authorization).toMatch(BEARER_JWT);
    expect(request.headers.authorization).not.toContain("frt_placeholder");
  });

  it("removes the Authorization header for anonymous calls", async () => {
    const mock = createMockFetch([
      { body: {}, method: "POST", path: "/auth/login" },
    ]);
    const authFetch = createAuthFetch(
      { kind: "anonymous" },
      { fetch: mock.fetch }
    );

    await authFetch("https://api.test.frontal.dev/v1/auth/login", {
      headers: { Authorization: "Bearer frt_placeholder_000000" },
      method: "POST",
    });

    expect(
      mock.expectCalled("POST", "/auth/login").headers.authorization
    ).toBeUndefined();
  });

  it("refreshes an expired token and persists it to the profile", async () => {
    const freshToken = jwtWithExp(Math.floor(Date.now() / 1000) + 7200);
    const mock = createMockFetch([
      {
        body: {
          access_token: freshToken,
          expires_in: 7200,
          refresh_token: "refresh-2",
          token_type: "Bearer",
        },
        method: "POST",
        path: "/oauth/token",
      },
      { body: { ok: true }, method: "GET", path: "/ping" },
    ]);
    // refreshTokens() uses the global fetch.
    vi.stubGlobal("fetch", mock.fetch);
    const setProfile = vi.spyOn(configManager, "setProfile");

    const authFetch = createAuthFetch(
      {
        accessToken: "expired-token",
        authUrl: "https://auth.test.frontal.dev",
        expiresAt: Math.floor(Date.now() / 1000) - 10,
        kind: "oauth",
        profileName: "default",
        refreshToken: "refresh-1",
      },
      { fetch: mock.fetch }
    );

    await authFetch("https://api.test.frontal.dev/v1/ping");

    mock.expectCalled("POST", "/oauth/token");
    expect(mock.expectCalled("GET", "/ping").headers.authorization).toBe(
      `Bearer ${freshToken}`
    );
    expect(setProfile).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({
        accessToken: freshToken,
        refreshToken: "refresh-2",
      })
    );
    vi.unstubAllGlobals();
  });

  it("fails with TOKEN_EXPIRED when there is nothing to refresh with", async () => {
    const authFetch = createAuthFetch({
      accessToken: "expired-token",
      expiresAt: 1,
      kind: "oauth",
      profileName: "default",
    });

    await expect(
      authFetch("https://api.test.frontal.dev/v1/ping")
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("reports the response request id", async () => {
    const mock = createMockFetch([
      {
        body: {},
        headers: { "x-request-id": "req_123" },
        method: "GET",
        path: "/ping",
      },
    ]);
    const seen: string[] = [];
    const authFetch = createAuthFetch(
      { apiKey: TEST_API_KEY, kind: "api-key" },
      { fetch: mock.fetch, onRequestId: (id) => seen.push(id) }
    );

    await authFetch("https://api.test.frontal.dev/v1/ping");

    expect(seen).toEqual(["req_123"]);
  });
});

describe("createSdkHandle / getSdk", () => {
  it("builds a client that sends the API key and CLI header through the SDK", async () => {
    const mock = createMockFetch([
      {
        body: {
          data: [{ id: "wf_1", name: "n" }],
          pagination: { cursor: "c", has_more: false },
        },
        headers: { "x-request-id": "req_wf" },
        method: "GET",
        path: "/workflows",
      },
    ]);

    const handle = await createSdkHandle({
      baseUrl: TEST_BASE_URL,
      credential: { apiKey: TEST_API_KEY, kind: "api-key" },
      fetch: mock.fetch,
      maxRetries: 0,
    });
    const page = await handle.frontal.workflows.list({ limit: 5 });

    const request = mock.expectCalled("GET", "/workflows");
    expect(request.headers.authorization).toBe(`Bearer ${TEST_API_KEY}`);
    expect(request.headers["x-frontal-cli"]).toBeDefined();
    expect(request.url).toContain("limit=5");
    expect(page.data[0]?.name).toBe("n");
    expect(handle.lastRequestId).toBe("req_wf");
  });

  it("rejects malformed keys with CONFIG_INVALID", async () => {
    await expect(
      createSdkHandle({
        baseUrl: TEST_BASE_URL,
        credential: { apiKey: "bad", kind: "api-key" },
      })
    ).rejects.toMatchObject({ code: "CONFIG_INVALID", exitCode: 6 });
  });

  it("throws NO_CREDENTIALS when nothing is configured", async () => {
    configManager.setProfile("default", {
      accessToken: undefined,
      apiKey: undefined,
    });
    await expect(getSdk({})).rejects.toBeInstanceOf(CliError);
    await expect(getSdk({})).rejects.toMatchObject({ code: "NO_CREDENTIALS" });
  });
});
