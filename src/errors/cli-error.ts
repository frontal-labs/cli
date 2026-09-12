import { EXIT_CODES } from "@/errors/exit-codes.js";

export const DOCS_BASE_URL = "https://frontal.dev/docs/cli/errors";

export interface CliErrorOptions {
  cause?: unknown;
  docs?: string;
  exitCode?: number;
  fix?: string;
  requestId?: string;
}

/**
 * Error raised by the CLI itself (configuration, filesystem, usage).
 * API errors come from the SDK as `FrontalError`; both are rendered by
 * `handleError` with a code, fix hint, docs link and request id.
 */
export class CliError extends Error {
  readonly code: string;
  readonly docs: string;
  readonly exitCode: number;
  readonly fix?: string;
  readonly requestId?: string;

  constructor(code: string, message: string, options: CliErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.code = code;
    this.fix = options.fix;
    this.docs = options.docs ?? docsUrlFor(code);
    this.exitCode = options.exitCode ?? EXIT_CODES.GENERAL_ERROR;
    this.requestId = options.requestId;
  }
}

export function docsUrlFor(code: string): string {
  return `${DOCS_BASE_URL}#${code.toLowerCase().replace(/_/g, "-")}`;
}
