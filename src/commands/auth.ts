import { randomBytes } from "node:crypto";
import type { Command } from "commander";
import { startCallbackServer } from "../auth/callback-server.js";
import {
  CALLBACK_PATH,
  CLI_CLIENT_ID,
  CLI_SCOPES,
  DEFAULT_AUTH_URL,
} from "../auth/constants.js";
import { generateCodeChallenge, generateCodeVerifier } from "../auth/pkce.js";
import {
  decodeTokenExpiry,
  exchangeCode,
  isTokenExpired,
  refreshTokens,
} from "../auth/token-manager.js";
import { configManager } from "../config/manager.js";
import { resolveConfig } from "../config/resolve.js";
import { assertOperationSupported } from "../contract/operations.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { theme } from "../output/theme.js";
import { openBrowser } from "../utils/browser.js";
import {
  isInteractive,
  promptSecret,
  promptText,
} from "../utils/interactive.js";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Authenticate using browser OAuth or API key")
    .option("--profile <name>", "Save to specific profile")
    .option("--method <method>", "browser or api-key", "browser")
    .option("--auth-url <url>", "Auth service URL")
    .action(async (opts, cmd) => {
      try {
        const profileName =
          opts.profile ?? cmd.optsWithGlobals().profile ?? "default";
        const method = opts.method ?? "browser";

        if (method === "api-key" || !isInteractive()) {
          await loginWithApiKey(profileName, cmd);
          return;
        }

        await loginWithBrowser(profileName, opts, cmd);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("password-login")
    .description("Login via public auth API with email/password")
    .requiredOption("--email <email>", "Email")
    .requiredOption("--password <password>", "Password")
    .option("--profile <name>", "Save to specific profile")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/login");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());

        const result = await api.post<Record<string, unknown>>("/auth/login", {
          email: opts.email,
          password: opts.password,
        });

        const profileName =
          opts.profile ?? cmd.optsWithGlobals().profile ?? "default";

        const token = result.accessToken;
        const refreshToken = result.refreshToken;
        const expiresAt = result.expiresAt;

        configManager.setProfile(profileName, {
          ...(typeof token === "string" ? { accessToken: token } : {}),
          ...(typeof refreshToken === "string" ? { refreshToken } : {}),
          ...(typeof expiresAt === "number"
            ? { tokenExpiresAt: expiresAt }
            : {}),
        });
        configManager.setActiveProfile(profileName);

        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("signup")
    .description("Create a new account")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--password <password>", "Password")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/signup");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>("/auth/signup", {
          email: opts.email,
          password: opts.password,
        });
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("logout")
    .description("Remove credentials from a profile")
    .option("--profile <name>", "Profile to logout from")
    .action((opts, cmd) => {
      try {
        const profileName =
          opts.profile ?? cmd.optsWithGlobals().profile ?? "default";
        configManager.setProfile(profileName, {
          apiKey: undefined,
          accessToken: undefined,
          refreshToken: undefined,
          tokenExpiresAt: undefined,
          authUrl: undefined,
        });

        if (!(cmd.optsWithGlobals().json as boolean)) {
          console.log(
            theme.success(`Logged out from profile "${profileName}".`)
          );
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("whoami")
    .description("Show current authentication status")
    .action((_opts, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const config = resolveConfig(globalOpts);
        const fmt = Formatter.from(globalOpts);

        let authMethod = "none";
        if (config.accessToken) {
          authMethod = "oauth";
        } else if (config.apiKey) {
          authMethod = "api-key";
        }

        fmt.object({
          profile: configManager.getActiveProfileName(),
          authMethod,
          hasApiKey: Boolean(config.apiKey),
          hasAccessToken: Boolean(config.accessToken),
          tokenExpired: config.tokenExpiresAt
            ? isTokenExpired(config.tokenExpiresAt, 0)
            : undefined,
          tokenExpiry: config.tokenExpiresAt
            ? new Date(config.tokenExpiresAt * 1000).toISOString()
            : undefined,
          authUrl: config.authUrl,
          baseUrl: config.baseUrl,
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("token")
    .description("Print the raw access token or API key to stdout")
    .action((_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());

        if (config.accessToken) {
          process.stdout.write(config.accessToken);
          return;
        }

        if (!config.apiKey) {
          throw new Error(
            "No credentials configured. Run `frontal auth login`."
          );
        }

        process.stdout.write(config.apiKey);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("refresh")
    .description("Manually refresh OAuth tokens")
    .action(async (_opts, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const config = resolveConfig(globalOpts);
        const profileName = globalOpts.profile ?? "default";

        if (!(config.refreshToken && config.authUrl)) {
          throw new Error(
            "No OAuth tokens to refresh. Run `frontal auth login`."
          );
        }

        const tokens = await refreshTokens({
          authUrl: config.authUrl,
          refreshToken: config.refreshToken,
        });

        configManager.setProfile(profileName, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
        });

        const fmt = Formatter.from(globalOpts);
        fmt.object({
          refreshed: true,
          expiresAt: new Date(tokens.expiresAt * 1000).toISOString(),
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  const mfa = auth
    .command("mfa")
    .description("Manage multi-factor authentication");

  mfa
    .command("status")
    .description("Get MFA status")
    .action(async (_opts, cmd) => {
      try {
        assertOperationSupported("GET", "/auth/mfa/status");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result =
          await api.get<Record<string, unknown>>("/auth/mfa/status");
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  mfa
    .command("setup")
    .description("Setup MFA")
    .action(async (_opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/mfa/setup");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result =
          await api.post<Record<string, unknown>>("/auth/mfa/setup");
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  mfa
    .command("enable")
    .description("Enable MFA")
    .requiredOption("--code <code>", "Verification code")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/mfa/enable");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          "/auth/mfa/enable",
          {
            code: opts.code,
          }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  mfa
    .command("disable")
    .description("Disable MFA")
    .requiredOption("--code <code>", "Verification code")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/mfa/disable");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          "/auth/mfa/disable",
          {
            code: opts.code,
          }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  mfa
    .command("verify")
    .description("Verify MFA challenge")
    .requiredOption("--code <code>", "Verification code")
    .action(async (opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/mfa/verify");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          "/auth/mfa/verify",
          {
            code: opts.code,
          }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  mfa
    .command("backup-codes-regenerate")
    .description("Regenerate MFA backup codes")
    .action(async (_opts, cmd) => {
      try {
        assertOperationSupported("POST", "/auth/mfa/backup-codes/regenerate");
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          "/auth/mfa/backup-codes/regenerate"
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}

async function loginWithApiKey(
  profileName: string,
  cmd: Command
): Promise<void> {
  const apiKey = await promptSecret("Enter your API key (frt_...):");
  const baseUrl = await promptText(
    "API base URL:",
    "https://api.frontal.dev/v1"
  );

  const api = new ApiClient({ apiKey, baseUrl });
  try {
    assertOperationSupported("GET", "/auth/mfa/status");
    await api.get("/auth/mfa/status");
  } catch {
    // key might not have MFA scope, save anyway
  }

  configManager.setProfile(profileName, { apiKey, baseUrl });
  configManager.setActiveProfile(profileName);

  if (!(cmd.optsWithGlobals().json as boolean)) {
    console.log(
      theme.success(`Authenticated. Profile "${profileName}" saved.`)
    );
  }
}

async function loginWithBrowser(
  profileName: string,
  opts: { authUrl?: string },
  cmd: Command
): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  const profile = configManager.getProfile(globalOpts.profile ?? undefined);

  const authUrl =
    opts.authUrl ??
    process.env.FRONTAL_AUTH_URL ??
    profile.authUrl ??
    DEFAULT_AUTH_URL;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");

  const server = await startCallbackServer();

  const redirectUri = `http://127.0.0.1:${server.port}${CALLBACK_PATH}`;
  const authorizeUrl = new URL(`${authUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLI_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", CLI_SCOPES);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  const opened = await openBrowser(authorizeUrl.toString());
  if (!(opened || (globalOpts.json as boolean))) {
    console.log(theme.warn("Could not open browser automatically."));
    console.log(theme.dim(authorizeUrl.toString()));
  }

  try {
    const result = await server.waitForCode();

    if (result.state !== state) {
      throw new Error("State mismatch during OAuth login.");
    }

    const tokens = await exchangeCode({
      authUrl,
      code: result.code,
      redirectUri,
      codeVerifier,
    });

    const expiry = decodeTokenExpiry(tokens.accessToken);

    configManager.setProfile(profileName, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: expiry ?? tokens.expiresAt,
      authUrl,
    });
    configManager.setActiveProfile(profileName);

    if (!(globalOpts.json as boolean)) {
      console.log(
        theme.success(`Authenticated. Profile "${profileName}" saved.`)
      );
    }
  } finally {
    server.close();
  }
}
