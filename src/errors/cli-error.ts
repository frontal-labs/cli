import { FrontalError } from "@frontal-labs/error";
import { EXIT_CODES } from "@/errors/exit-codes.js";

export const DOCS_BASE_URL = "https://frontal.dev/docs/cli/errors";

export interface CliErrorOptions {
  cause?: unknown | undefined;
  docs?: string | undefined;
  exitCode?: number | undefined;
  fix?: string | undefined;
  requestId?: string | undefined;
}

/**
 * Error raised by the CLI itself (configuration, filesystem, usage).
 * API errors come from the SDK; both are rendered by `handleError`.
 */
export class CliError extends FrontalError<string> {
  declare readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, options: CliErrorOptions = {}) {
    super(message, {
      code,
      link: options.docs ?? docsUrlFor(code),
      scope: "cli",
      ...(options.cause === undefined ? {} : { cause: options.cause }),
      ...(options.fix === undefined ? {} : { fix: options.fix }),
    });
    this.name = "CliError";
    this.exitCode = options.exitCode ?? EXIT_CODES.GENERAL_ERROR;
    if (options.requestId !== undefined) {
      this.requestId = options.requestId;
    }
  }

  get docs(): string {
    return this.link ?? docsUrlFor(this.code);
  }
}

export function docsUrlFor(code: string): string {
  return `${DOCS_BASE_URL}#${code.toLowerCase().replace(/_/g, "-")}`;
}
