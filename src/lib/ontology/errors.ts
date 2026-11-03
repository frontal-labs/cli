import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";

/** Every error code the ontology commands raise. */
export const ONTOLOGY_ERROR_CODES = {
  corrupt: "ONTOLOGY_CORRUPT",
  invalid: "ONTOLOGY_INVALID",
  malformed: "ONTOLOGY_MALFORMED",
  missing: "ONTOLOGY_MISSING",
  outOfDate: "ONTOLOGY_OUT_OF_DATE",
  unauthorized: "ONTOLOGY_UNAUTHORIZED",
} as const;

/** Why a generated file is considered stale by `sync --check`. */
export type StaleReason = "missing" | "differs" | "hash-mismatch";

export interface StaleFile {
  file: string;
  reason: StaleReason;
}

/** The ontology violates a modelling rule the generator cannot translate. */
export function invalidOntology(message: string): CliError {
  return new CliError(ONTOLOGY_ERROR_CODES.invalid, message, {
    exitCode: EXIT_CODES.VALIDATION_ERROR,
    fix: "Fix the object type in Frontal Studio, then run `frontal sync` again.",
  });
}

/** A backend response does not have the shape the CLI expects. */
export function malformedResponse(message: string): CliError {
  return new CliError(ONTOLOGY_ERROR_CODES.malformed, message, {
    exitCode: EXIT_CODES.GENERAL_ERROR,
    fix: "Retry `frontal sync`. If it persists, report the request id to Frontal.",
  });
}

/** A committed `.frontal/` file cannot be read or does not match its own hash. */
export function corruptFile(
  file: string,
  reason: string,
  cause?: unknown
): CliError {
  return new CliError(
    ONTOLOGY_ERROR_CODES.corrupt,
    `.frontal/${file} ${reason}.`,
    {
      cause,
      exitCode: EXIT_CODES.VALIDATION_ERROR,
      fix: "Run `frontal sync` to regenerate .frontal/ from Frontal.",
    }
  );
}

export function missingSnapshot(): CliError {
  return new CliError(
    ONTOLOGY_ERROR_CODES.missing,
    ".frontal/ontology.json not found.",
    {
      exitCode: EXIT_CODES.VALIDATION_ERROR,
      fix: "Run `frontal sync` and commit the .frontal/ directory.",
    }
  );
}

export function outOfDate(stale: StaleFile[]): CliError {
  const list = stale
    .map((entry) => `${entry.file} (${entry.reason})`)
    .join(", ");
  return new CliError(
    ONTOLOGY_ERROR_CODES.outOfDate,
    `Generated files do not match .frontal/ontology.json: ${list}.`,
    {
      exitCode: EXIT_CODES.VALIDATION_ERROR,
      fix: "Run `frontal sync` locally and commit the .frontal/ changes.",
    }
  );
}

/**
 * Frontal rejected the credentials. The backend's error body is not parsed
 * here (the SDK's parser does not read the spec's `{ detail }` shape), so the
 * message is written from the status alone.
 */
export function unauthorized(cause: unknown): CliError {
  return new CliError(
    ONTOLOGY_ERROR_CODES.unauthorized,
    "Frontal rejected the API key (401 Unauthorized).",
    {
      cause,
      exitCode: EXIT_CODES.AUTH_ERROR,
      fix: "Check FRONTAL_API_KEY, --api-key or your profile, then run `frontal auth whoami`.",
    }
  );
}

/** True for an SDK error that carries an HTTP 401 status. */
export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && "statusCode" in err && err.statusCode === 401;
}

/** Names a file in a user-facing message: `.frontal/<name>`. */
export function frontalPath(file: string): string {
  return `.frontal/${file}`;
}
