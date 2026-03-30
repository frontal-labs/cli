import { createServer, type Server } from "node:http";
import { AUTH_TIMEOUT_MS, CALLBACK_PATH } from "./constants.js";

interface CallbackResult {
  code: string;
  state: string;
}

interface CallbackServer {
  close(): void;
  port: number;
  waitForCode(): Promise<CallbackResult>;
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Frontal CLI</title><style>
body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fafafa; }
.card { text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
h1 { color: #10b981; font-size: 1.5rem; }
p { color: #6b7280; }
</style></head><body>
<div class="card"><h1>Authentication Successful</h1><p>You can close this tab and return to the terminal.</p></div>
</body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><head><title>Frontal CLI</title><style>
body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fafafa; }
.card { text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
h1 { color: #ef4444; font-size: 1.5rem; }
p { color: #6b7280; }
</style></head><body>
<div class="card"><h1>Authentication Failed</h1><p>Please return to the terminal for details.</p></div>
</body></html>`;

export function startCallbackServer(opts?: {
  timeout?: number;
}): Promise<CallbackServer> {
  const timeout = opts?.timeout ?? AUTH_TIMEOUT_MS;

  return new Promise((resolveStart, rejectStart) => {
    let resolveCode: ((result: CallbackResult) => void) | null = null;
    let rejectCode: ((error: Error) => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const codePromise = new Promise<CallbackResult>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        const description = url.searchParams.get("error_description") ?? error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(ERROR_HTML);
        rejectCode?.(new Error(`OAuth error: ${description}`));
        cleanup();
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML);
        rejectCode?.(new Error("No authorization code received"));
        cleanup();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);
      resolveCode?.({ code, state: state ?? "" });
      cleanup();
    });

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
      }
      server.close();
    }

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        rejectStart(new Error("Failed to start callback server"));
        return;
      }

      timer = setTimeout(() => {
        rejectCode?.(new Error("Authentication timed out. Please try again."));
        server.close();
      }, timeout);

      resolveStart({
        port: addr.port,
        waitForCode: () => codePromise,
        close: () => cleanup(),
      });
    });

    server.on("error", (err) => {
      rejectStart(err);
    });
  });
}
