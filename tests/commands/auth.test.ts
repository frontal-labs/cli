import { createMockFetch } from "@frontal-labs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configManager } from "@/config/manager.js";
import { lastJson, mockApi, runCli, TEST_API_KEY } from "../helpers/cli.js";

function resetProfile(): void {
  configManager.setProfile("default", {
    accessToken: undefined,
    apiKey: undefined,
    authUrl: undefined,
    baseUrl: undefined,
    refreshToken: undefined,
    tokenExpiresAt: undefined,
  });
  configManager.setActiveProfile("default");
}

describe("frontal auth", () => {
  beforeEach(resetProfile);

  it("password-login posts credentials without an Authorization header and stores tokens", async () => {
    const mock = await mockApi([
      {
        body: {
          access_token: "jwt-access",
          expires_at: 1_900_000_000,
          refresh_token: "jwt-refresh",
        },
        method: "POST",
        path: "/auth/login",
      },
    ]);

    const result = await runCli([
      "auth",
      "password-login",
      "--email",
      "dev@example.com",
      "--password",
      "hunter2",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const request = mock.expectCalledWith("POST", "/auth/login", {
      email: "dev@example.com",
      password: "hunter2",
    });
    expect(request.headers.authorization).toBeUndefined();
    expect(configManager.getProfile("default")).toMatchObject({
      accessToken: "jwt-access",
      refreshToken: "jwt-refresh",
      tokenExpiresAt: 1_900_000_000,
    });
    // Tokens are never echoed.
    expect(result.stdout.join("\n")).not.toContain("jwt-access");
  });

  it("signup posts to /auth/signup anonymously", async () => {
    const mock = await mockApi([
      { body: { id: "u1" }, method: "POST", path: "/auth/signup", status: 201 },
    ]);

    const result = await runCli([
      "auth",
      "signup",
      "--email",
      "new@example.com",
      "--password",
      "hunter2",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(
      mock.expectCalled("POST", "/auth/signup").headers.authorization
    ).toBeUndefined();
    expect(lastJson(result.stdout)).toEqual({ id: "u1" });
  });

  it("mfa subcommands call the /auth/mfa endpoints", async () => {
    const mock = await mockApi([
      { body: { enabled: false }, method: "GET", path: "/auth/mfa/status" },
      {
        body: { secret: "otp-secret" },
        method: "POST",
        path: "/auth/mfa/setup",
      },
      { body: { enabled: true }, method: "POST", path: "/auth/mfa/enable" },
      { body: { enabled: false }, method: "POST", path: "/auth/mfa/disable" },
      { body: { ok: true }, method: "POST", path: "/auth/mfa/verify" },
      {
        body: { codes: ["a"] },
        method: "POST",
        path: "/auth/mfa/backup-codes/regenerate",
      },
    ]);

    const status = await runCli(["auth", "mfa", "status", "--json"]);
    const setup = await runCli(["auth", "mfa", "setup", "--json"]);
    await runCli(["auth", "mfa", "enable", "--code", "111111", "--json"]);
    await runCli(["auth", "mfa", "disable", "--code", "222222", "--json"]);
    await runCli(["auth", "mfa", "verify", "--code", "333333", "--json"]);
    await runCli(["auth", "mfa", "backup-codes-regenerate", "--json"]);

    expect(status.exitCode).toBe(0);
    expect(lastJson(status.stdout)).toEqual({ enabled: false });
    expect(
      mock.expectCalled("GET", "/auth/mfa/status").headers.authorization
    ).toBe(`Bearer ${TEST_API_KEY}`);
    // The MFA secret is masked in output.
    expect(lastJson(setup.stdout)).toEqual({ secret: "[REDACTED]" });
    mock.expectCalledWith("POST", "/auth/mfa/enable", { code: "111111" });
    mock.expectCalledWith("POST", "/auth/mfa/disable", { code: "222222" });
    mock.expectCalledWith("POST", "/auth/mfa/verify", { code: "333333" });
    mock.expectCalled("POST", "/auth/mfa/backup-codes/regenerate");
  });

  it("whoami reports local status and the remote account profile", async () => {
    configManager.setProfile("default", { apiKey: TEST_API_KEY });
    await mockApi([
      {
        body: { email: "dev@example.com", id: "user_1" },
        method: "GET",
        path: "/auth/account/profile",
      },
    ]);

    const result = await runCli(["auth", "whoami", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(lastJson(result.stdout)).toMatchObject({
      account: { email: "dev@example.com", id: "user_1" },
    });
  });

  it("whoami --local does not call the API", async () => {
    const mock = await mockApi([]);
    configManager.setProfile("default", { apiKey: TEST_API_KEY });

    const result = await runCli(["auth", "whoami", "--local", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(mock.requests).toHaveLength(0);
    expect(lastJson(result.stdout)).toMatchObject({
      authMethod: "api-key",
      hasApiKey: true,
      profile: "default",
    });
  });

  it("login --method api-key validates the key against the account profile before saving", async () => {
    const mock = createMockFetch([
      { body: { id: "user_1" }, method: "GET", path: "/auth/account/profile" },
    ]);
    vi.stubGlobal("fetch", mock.fetch);
    const interactive = await import("@/utils/interactive.js");
    vi.spyOn(interactive, "promptSecret").mockResolvedValue(TEST_API_KEY);
    vi.spyOn(interactive, "promptText").mockResolvedValue(
      "https://api.test.frontal.dev/v1"
    );

    const result = await runCli(["auth", "login", "--method", "api-key"]);

    expect(result.exitCode).toBe(0);
    expect(
      mock.expectCalled("GET", "/auth/account/profile").headers.authorization
    ).toBe(`Bearer ${TEST_API_KEY}`);
    expect(configManager.getProfile("default")).toMatchObject({
      apiKey: TEST_API_KEY,
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    vi.unstubAllGlobals();
  });

  it("login --method api-key rejects a key the API refuses", async () => {
    const mock = createMockFetch([
      {
        body: { code: "UNAUTHORIZED", message: "nope", requestId: "req_x" },
        method: "GET",
        path: "/auth/account/profile",
        status: 401,
      },
    ]);
    vi.stubGlobal("fetch", mock.fetch);
    const interactive = await import("@/utils/interactive.js");
    vi.spyOn(interactive, "promptSecret").mockResolvedValue(
      "frt_rejected_key_000"
    );
    vi.spyOn(interactive, "promptText").mockResolvedValue(
      "https://api.test.frontal.dev/v1"
    );

    const result = await runCli([
      "auth",
      "login",
      "--method",
      "api-key",
      "--json",
    ]);

    expect(result.exitCode).toBe(3);
    expect(lastJson(result.stderr).error).toMatchObject({
      code: "INVALID_API_KEY",
      requestId: "req_x",
    });
    expect(configManager.getProfile("default").apiKey).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("logout clears credentials and token prints nothing without them", async () => {
    configManager.setProfile("default", { apiKey: TEST_API_KEY });

    const logout = await runCli(["auth", "logout"]);
    expect(logout.exitCode).toBe(0);
    expect(configManager.getProfile("default").apiKey).toBeUndefined();

    const token = await runCli(["auth", "token", "--json"]);
    expect(token.exitCode).toBe(3);
    expect(lastJson(token.stderr).error).toMatchObject({
      code: "NO_CREDENTIALS",
    });
  });
});
