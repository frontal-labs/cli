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
      apiKey: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
      authUrl: undefined,
    });
    configManager.setActiveProfile("default");
  });

  it("prefers --api-key over FRONTAL_API_KEY over the profile", () => {
    process.env.FRONTAL_API_KEY = "frt_from_env_000000";
    configManager.setProfile("default", { apiKey: "frt_from_profile_00" });

    expect(
      resolveCredential(resolveConfig({ apiKey: "frt_from_flag_0000" }))
    ).toEqual({ kind: "api-key", apiKey: "frt_from_flag_0000" });
    expect(resolveCredential(resolveConfig({}))).toEqual({
      kind: "api-key",
      apiKey: "frt_from_env_000000",
    });

    delete process.env.FRONTAL_API_KEY;
    expect(resolveCredential(resolveConfig({}))).toEqual({
      kind: "api-key",
      apiKey: "frt_from_profile_00",
    });
  });

  it("falls back to the stored OAuth session", () => {
    configManager.setProfile("default", {
      accessToken: "token-abc",
      refreshToken: "refresh-abc",
      tokenExpiresAt: 123,
      authUrl: "https://auth.test.frontal.dev",
    });

    expect(resolveCredential(resolveConfig({}))).toEqual({
      kind: "oauth",
      accessToken: "token-abc",
      refreshToken: "refresh-abc",
      expiresAt: 123,
      authUrl: "https://auth.test.frontal.dev",
      profileName: "default",
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
      { method: "GET", path: "/ping", body: { ok: true } },
    ]);
    const authFetch = createAuthFetch(
      {
        kind: "oauth",
        accessToken: jwtWithExp(Math.floor(Date.now() / 1000) + 3600),
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
      { method: "POST", path: "/auth/login", body: {} },
    ]);
    const authFetch = createAuthFetch(
      { kind: "anonymous" },
      { fetch: mock.fetch }
    );

    await authFetch("https://api.test.frontal.dev/v1/auth/login", {
      method: "POST",
      headers: { Authorization: "Bearer frt_placeholder_000000" },
    });

    expect(
      mock.expectCalled("POST", "/auth/login").headers.authorization
    ).toBeUndefined();
  });

  it("refreshes an expired token and persists it to the profile", async () => {
    const freshToken = jwtWithExp(Math.floor(Date.now() / 1000) + 7200);
    const mock = createMockFetch([
      {
        method: "POST",
        path: "/oauth/token",
        body: {
          access_token: freshToken,
          refresh_token: "refresh-2",
          expires_in: 7200,
          token_type: "Bearer",
        },
      },
      { method: "GET", path: "/ping", body: { ok: true } },
    ]);
    // refreshTokens() uses the global fetch.
    vi.stubGlobal("fetch", mock.fetch);
    const setProfile = vi.spyOn(configManager, "setProfile");

    const authFetch = createAuthFetch(
      {
        kind: "oauth",
        accessToken: "expired-token",
        refreshToken: "refresh-1",
        expiresAt: Math.floor(Date.now() / 1000) - 10,
        authUrl: "https://auth.test.frontal.dev",
        profileName: "default",
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
      kind: "oauth",
      accessToken: "expired-token",
      expiresAt: 1,
      profileName: "default",
    });

    await expect(
      authFetch("https://api.test.frontal.dev/v1/ping")
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("reports the response request id", async () => {
    const mock = createMockFetch([
      {
        method: "GET",
        path: "/ping",
        body: {},
        headers: { "x-request-id": "req_123" },
      },
    ]);
    const seen: string[] = [];
    const authFetch = createAuthFetch(
      { kind: "api-key", apiKey: TEST_API_KEY },
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
        method: "GET",
        path: "/workflows",
        body: {
          data: [{ id: "wf_1", name: "n" }],
          pagination: { cursor: "c", has_more: false },
        },
        headers: { "x-request-id": "req_wf" },
      },
    ]);

    const handle = await createSdkHandle({
      credential: { kind: "api-key", apiKey: TEST_API_KEY },
      baseUrl: TEST_BASE_URL,
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
        credential: { kind: "api-key", apiKey: "bad" },
        baseUrl: TEST_BASE_URL,
      })
    ).rejects.toMatchObject({ code: "CONFIG_INVALID", exitCode: 6 });
  });

  it("throws NO_CREDENTIALS when nothing is configured", async () => {
    configManager.setProfile("default", {
      apiKey: undefined,
      accessToken: undefined,
    });
    await expect(getSdk({})).rejects.toBeInstanceOf(CliError);
    await expect(getSdk({})).rejects.toMatchObject({ code: "NO_CREDENTIALS" });
  });
});
