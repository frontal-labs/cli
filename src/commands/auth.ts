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
  const auth = program
    .command("auth")
    .description("Authentication and credential management");

  auth
    .command("login")
    .description("Authenticate with the Frontal API")
    .option("--profile <name>", "Save to specific profile")
    .option(
      "--method <method>",
      "Auth method: browser (default) or api-key",
      "browser"
    )
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
    .command("logout")
    .description("Remove credentials from a profile")
    .option("--profile <name>", "Profile to logout from")
    .action(async (opts, cmd) => {
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
        console.log(theme.success(`Logged out from profile "${profileName}".`));
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("whoami")
    .description("Show current authentication status")
    .action(async (_opts, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const config = resolveConfig(globalOpts);
        const fmt = Formatter.from(globalOpts);

        const authMethod = config.accessToken
          ? "browser (OAuth)"
          : config.apiKey
            ? "api-key"
            : "none";

        const maskedKey = config.apiKey
          ? `${config.apiKey.slice(0, 7)}...${config.apiKey.slice(-4)}`
          : "(not set)";

        const tokenExpiry = config.tokenExpiresAt
          ? new Date(config.tokenExpiresAt * 1000).toISOString()
          : undefined;

        const tokenStatus = config.accessToken
          ? config.tokenExpiresAt && isTokenExpired(config.tokenExpiresAt, 0)
            ? "expired"
            : "valid"
          : undefined;

        fmt.object({
          profile: configManager.getActiveProfileName(),
          authMethod,
          apiKey: maskedKey,
          ...(config.accessToken
            ? {
                tokenStatus,
                tokenExpiry,
                authUrl: config.authUrl ?? "(not set)",
              }
            : {}),
          baseUrl: config.baseUrl,
          orgId: config.orgId ?? "(not set)",
          workspaceId: config.workspaceId ?? "(not set)",
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("token")
    .description("Print the raw access token or API key to stdout")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());

        if (config.accessToken) {
          if (
            config.tokenExpiresAt &&
            isTokenExpired(config.tokenExpiresAt) &&
            config.refreshToken &&
            config.authUrl
          ) {
            try {
              const tokens = await refreshTokens({
                authUrl: config.authUrl,
                refreshToken: config.refreshToken,
              });
              const profileName = cmd.optsWithGlobals().profile ?? "default";
              configManager.setProfile(profileName, {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiresAt: tokens.expiresAt,
              });
              process.stdout.write(tokens.accessToken);
              return;
            } catch {
              // Fall through to print current token
            }
          }
          process.stdout.write(config.accessToken);
          return;
        }

        if (!config.apiKey) {
          console.error(
            theme.error("No credentials configured. Run `frontal auth login`.")
          );
          process.exit(1);
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
          console.error(
            theme.error("No OAuth tokens to refresh. Run `frontal auth login`.")
          );
          process.exit(1);
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

        console.log(theme.success("Tokens refreshed successfully."));
        console.log(
          theme.dim(
            `Expires: ${new Date(tokens.expiresAt * 1000).toISOString()}`
          )
        );
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
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post("/auth/signup", {
          email: opts.email,
          password: opts.password,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("sessions")
    .description("List active sessions")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/auth/sessions"
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "createdAt", header: "CREATED" },
          { key: "lastActiveAt", header: "LAST ACTIVE" },
          { key: "userAgent", header: "USER AGENT" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("session:revoke")
    .description("Revoke a session")
    .argument("<id>", "Session ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        await api.delete(`/auth/sessions/${id}`);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.success("Session revoked.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("mfa:enroll")
    .description("Enroll a new MFA factor")
    .requiredOption("--type <type>", "Factor type (totp, sms)")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post("/auth/mfa", { type: opts.type });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("mfa:verify")
    .description("Verify an MFA factor")
    .argument("<factor-id>", "Factor ID")
    .requiredOption("--code <code>", "Verification code")
    .action(async (factorId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.post(`/auth/mfa/${factorId}/verify`, {
          code: opts.code,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("mfa:list")
    .description("List enrolled MFA factors")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/auth/mfa"
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "type", header: "TYPE" },
          { key: "status", header: "STATUS" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}

async function loginWithApiKey(
  profileName: string,
  _cmd: Command
): Promise<void> {
  const apiKey = await promptSecret("Enter your API key (frt_...):");
  const baseUrl = await promptText(
    "API base URL:",
    "https://api.frontal.dev/v1"
  );

  const api = new ApiClient({ apiKey, baseUrl });

  try {
    await api.get("/orgs");
  } catch {
    console.log(
      theme.warn("Warning: Could not validate API key. Saving anyway.")
    );
  }

  configManager.setProfile(profileName, { apiKey, baseUrl });
  configManager.setActiveProfile(profileName);

  console.log(theme.success(`Authenticated. Profile "${profileName}" saved.`));
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
    globalOpts.apiUrl ??
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

  console.log(theme.info("Opening browser for authentication..."));
  console.log(
    theme.dim(
      `If the browser doesn't open, visit:\n${authorizeUrl.toString()}\n`
    )
  );

  const opened = await openBrowser(authorizeUrl.toString());
  if (!opened) {
    console.log(
      theme.warn("Could not open browser. Please visit the URL above manually.")
    );
  }

  console.log(theme.dim("Waiting for authentication..."));

  try {
    const result = await server.waitForCode();

    if (result.state !== state) {
      throw new Error(
        "State mismatch. Possible CSRF attack. Please try again."
      );
    }

    const tokens = await exchangeCode({
      authUrl,
      code: result.code,
      redirectUri,
      codeVerifier,
    });

    configManager.setProfile(profileName, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      authUrl,
    });
    configManager.setActiveProfile(profileName);

    console.log(
      theme.success(`Authenticated. Profile "${profileName}" saved.`)
    );

    const expiry = decodeTokenExpiry(tokens.accessToken);
    if (expiry) {
      console.log(
        theme.dim(`Token expires: ${new Date(expiry * 1000).toISOString()}`)
      );
    }
  } catch (err) {
    server.close();
    throw err;
  }
}
