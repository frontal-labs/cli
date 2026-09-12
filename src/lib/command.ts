import type { Command } from "commander";
import type { GlobalOptions } from "@/config/resolve.js";
import { handleError } from "@/errors/handler.js";
import { type GetSdkOptions, getSdk, type SdkHandle } from "@/lib/sdk.js";
import { Formatter } from "@/output/formatter.js";

export interface CommandContext {
  fmt: Formatter;
  globalOpts: GlobalOptions & Record<string, unknown>;
  /**
   * Creates the SDK handle. Calls without options share one handle; calls
   * with options (anonymous, abort signal) get a dedicated client.
   */
  sdk: (options?: GetSdkOptions) => Promise<SdkHandle>;
}

/**
 * Runs a command action with uniform error handling. API errors are printed
 * with code/fix/docs and the request id captured by the SDK transport.
 */
export async function runAction(
  cmd: Command,
  fn: (ctx: CommandContext) => Promise<void> | void
): Promise<void> {
  const globalOpts = cmd.optsWithGlobals() as CommandContext["globalOpts"];
  let handle: SdkHandle | undefined;

  const ctx: CommandContext = {
    globalOpts,
    fmt: Formatter.from(globalOpts),
    sdk: async (options) => {
      if (options) {
        const dedicated = await getSdk(globalOpts, options);
        handle ??= dedicated;
        return dedicated;
      }
      handle ??= await getSdk(globalOpts);
      return handle;
    },
  };

  try {
    await fn(ctx);
  } catch (err) {
    handleError(err, globalOpts, { requestId: handle?.lastRequestId });
  }
}

export function paginationParams(opts: {
  cursor?: string;
  limit?: string | number;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (opts.limit !== undefined && opts.limit !== "") {
    params.limit = Number(opts.limit);
  }
  if (opts.cursor) {
    params.cursor = opts.cursor;
  }
  return params;
}
