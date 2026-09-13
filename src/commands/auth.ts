import { randomBytes } from "node:crypto";
import type { Command } from "commander";
import { startCallbackServer } from "@/auth/callback-server.js";
import {
  CALLBACK_PATH,
  CLI_CLIENT_ID,
  CLI_SCOPES,
  DEFAULT_AUTH_URL,
} from "@/auth/constants.js";
import { generateCodeChallenge, generateCodeVerifier } from "@/auth/pkce.js";
import {
  decodeTokenExpiry,
  exchangeCode,
  isTokenExpired,
  refreshTokens,
} from "@/auth/token-manager.js";
import { configManager } from "@/config/manager.js";
import { resolveConfig } from "@/config/resolve.js";
import { assertOperationSupported } from "@/contract/operations.js";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { handleError } from "@/errors/handler.js";
import { runAction } from "@/lib/command.js";
import { withExamples } from "@/lib/output.js";
import { createSdkHandle } from "@/lib/sdk.js";
import { theme } from "@/output/theme.js";
import { openBrowser } from "@/utils/browser.js";
import {
  isInteractive,
  promptSecret,
  promptText,
} from "@/utils/interactive.js";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Sign in, API keys and MFA");

  auth
    .command("login")
    .description("Authenticate using browser OAuth or API key")
    .option("--profile <name>", "Save to specific profile")
    .option("--method <method>", "browser or api-key", "browser")
    .option("--auth-url <url>", "Auth service URL")
    .action(async (opts, cmd) => {
      try {
        const profileName =
          opts.profile ??
          cmd.optsWithGlobals().profile ??
          configManager.getActiveProfileName();
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
    .action((opts, cmd) =>
      runAction(cmd, async ({ fmt, globalOpts, sdk }) => {
        assertOperationSupported("POST", "/auth/login");
        const { http } = await sdk({ anonymous: true });

        const result = await http.post<Record<string, unknown>>("/auth/login", {
          email: opts.email,
          password: opts.password,
        });

        const profileName =
          opts.profile ??
          globalOpts.profile ??
          configManager.getActiveProfileName();

        const token = result.accessToken;
        const { refreshToken, expiresAt } = result;

        configManager.setProfile(profileName, {
          ...(typeof token === "string" ? { accessToken: token } : {}),
          ...(typeof refreshToken === "string" ? { refreshToken } : {}),
          ...(typeof expiresAt === "number"
            ? { tokenExpiresAt: expiresAt }
            : {}),
        });
        configManager.setActiveProfile(profileName);

        fmt.object(result);
      })
    );

  auth
    .command("signup")
    .description("Create a new account")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--password <password>", "Password")
    .action((opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("POST", "/auth/signup");
        const { http } = await sdk({ anonymous: true });
        const result = await http.post<Record<string, unknown>>(
          "/auth/signup",
          { email: opts.email, password: opts.password }
        );
        fmt.object(result);
      })
    );

  auth
    .command("logout")
    .description("Remove credentials from a profile")
    .option("--profile <name>", "Profile to logout from")
    .action((opts, cmd) => {
      try {
        const profileName =
          opts.profile ??
          cmd.optsWithGlobals().profile ??
          configManager.getActiveProfileName();
        configManager.setProfile(profileName, {
          accessToken: undefined,
          apiKey: undefined,
          authUrl: undefined,
          refreshToken: undefined,
          tokenExpiresAt: undefined,
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

  withExamples(
    auth
      .command("whoami")
      .description("Show current authentication status")
      .option("--local", "Do not call the API; show local status only")
      .action((opts, cmd) =>
        runAction(cmd, async ({ fmt, globalOpts, sdk }) => {
          const config = resolveConfig(globalOpts);

          let authMethod = "none";
          if (config.apiKey) {
            authMethod = "api-key";
          } else if (config.accessToken) {
            authMethod = "oauth";
          }

          const status: Record<string, unknown> = {
            authMethod,
            authUrl: config.authUrl,
            baseUrl: config.baseUrl,
            hasAccessToken: Boolean(config.accessToken),
            hasApiKey: Boolean(config.apiKey),
            profile: config.profileName,
            tokenExpired: config.tokenExpiresAt
              ? isTokenExpired(config.tokenExpiresAt, 0)
              : undefined,
            tokenExpiry: config.tokenExpiresAt
              ? new Date(config.tokenExpiresAt * 1000).toISOString()
              : undefined,
          };

          if (authMethod !== "none" && !opts.local) {
            const { frontal } = await sdk();
            status.account = await frontal.auth.account.getProfile();
          }

          fmt.object(status);
        })
      ),
    ["frontal auth whoami", "frontal auth whoami --local --json"]
  );

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
          throw new CliError("NO_CREDENTIALS", "No credentials configured.", {
            exitCode: EXIT_CODES.AUTH_ERROR,
            fix: "Run `frontal auth login` or set FRONTAL_API_KEY.",
          });
        }

        process.stdout.write(config.apiKey);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  auth
    .command("refresh")
    .description("Manually refresh OAuth tokens")
    .action((_opts, cmd) =>
      runAction(cmd, async ({ fmt, globalOpts }) => {
        const config = resolveConfig(globalOpts);

        if (!(config.refreshToken && config.authUrl)) {
          throw new CliError(
            "NO_REFRESH_TOKEN",
            "No OAuth tokens to refresh.",
            {
              exitCode: EXIT_CODES.AUTH_ERROR,
              fix: "Run `frontal auth login` to start a browser session.",
            }
          );
        }

        const tokens = await refreshTokens({
          authUrl: config.authUrl,
          refreshToken: config.refreshToken,
        });

        configManager.setProfile(config.profileName, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
        });

        fmt.object({
          expiresAt: new Date(tokens.expiresAt * 1000).toISOString(),
          refreshed: true,
        });
      })
    );

  const mfa = auth
    .command("mfa")
    .description("Manage multi-factor authentication");

  mfa
    .command("status")
    .description("Get MFA status")
    .action((_opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("GET", "/auth/mfa/status");
        const { http } = await sdk();
        const result =
          await http.get<Record<string, unknown>>("/auth/mfa/status");
        fmt.object(result);
      })
    );

  mfa
    .command("setup")
    .description("Setup MFA")
    .action((_opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("POST", "/auth/mfa/setup");
        const { http } = await sdk();
        const result =
          await http.post<Record<string, unknown>>("/auth/mfa/setup");
        fmt.object(result);
      })
    );

  mfa
    .command("enable")
    .description("Enable MFA")
    .requiredOption("--code <code>", "Verification code")
    .action((opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("POST", "/auth/mfa/enable");
        const { http } = await sdk();
        const result = await http.post<Record<string, unknown>>(
          "/auth/mfa/enable",
          { code: opts.code }
        );
        fmt.object(result);
      })
    );

  mfa
    .command("disable")
    .description("Disable MFA")
    .requiredOption("--code <code>", "Verification code")
    .action((opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("POST", "/auth/mfa/disable");
        const { http } = await sdk();
        const result = await http.post<Record<string, unknown>>(
          "/auth/mfa/disable",
          { code: opts.code }
        );
        fmt.object(result);
      })
    );

  mfa
    .command("verify")
    .description("Verify MFA challenge")
    .requiredOption("--code <code>", "Verification code")
    .action((opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("POST", "/auth/mfa/verify");
        const { http } = await sdk();
        const result = await http.post<Record<string, unknown>>(
          "/auth/mfa/verify",
          { code: opts.code }
        );
        fmt.object(result);
      })
    );

  mfa
    .command("backup-codes-regenerate")
    .description("Regenerate MFA backup codes")
    .action((_opts, cmd) =>
      runAction(cmd, async ({ fmt, sdk }) => {
        assertOperationSupported("POST", "/auth/mfa/backup-codes/regenerate");
        const { http } = await sdk();
        const result = await http.post<Record<string, unknown>>(
          "/auth/mfa/backup-codes/regenerate"
        );
        fmt.object(result);
      })
    );
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

  // Validate the key against the account endpoint before persisting it.
  const { frontal } = await createSdkHandle({
    baseUrl,
    credential: { apiKey, kind: "api-key" },
    maxRetries: 0,
  });
  try {
    await frontal.auth.account.getProfile();
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      // biome-ignore lint/style/useErrorCause: cause is forwarded through CliError options
      throw new CliError("INVALID_API_KEY", "The API key was rejected.", {
        cause: err,
        exitCode: EXIT_CODES.AUTH_ERROR,
        fix: "Create a key in the Frontal dashboard and make sure it starts with frt_.",
        requestId: (err as { requestId?: string }).requestId,
      });
    }
    // Any other failure (network, missing scope) should not block saving.
    if (!(cmd.optsWithGlobals().json as boolean)) {
      console.error(
        theme.warn("Could not verify the key against the API; saving anyway.")
      );
    }
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
      codeVerifier,
      redirectUri,
    });

    const expiry = decodeTokenExpiry(tokens.accessToken);

    configManager.setProfile(profileName, {
      accessToken: tokens.accessToken,
      authUrl,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: expiry ?? tokens.expiresAt,
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
