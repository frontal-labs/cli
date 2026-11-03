import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";

/** Every error code the ontology commands raise. */
export const ONTOLOGY_ERROR_CODES = {
  corrupt: "ONTOLOGY_CORRUPT",
  invalid: "ONTOLOGY_INVALID",
  malformed: "ONTOLOGY_MALFORMED",
  missing: "ONTOLOGY_MISSING",
  outOfDate: "ONTOLOGY_OUT_OF_DATE",
  pageFailed: "ONTOLOGY_PAGE_FAILED",
  pageLimit: "ONTOLOGY_PAGE_LIMIT",
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

/** A page after the first could not be read. Nothing has been written yet. */
export function pageFailed(page: number, cause: unknown): CliError {
  return new CliError(
    ONTOLOGY_ERROR_CODES.pageFailed,
    `Could not read object-type page ${page}. No files were written.`,
    {
      cause,
      exitCode: EXIT_CODES.NETWORK_ERROR,
      fix: "Retry `frontal sync`. Local files are unchanged.",
    }
  );
}

export function pageLimit(maxPages: number): CliError {
  return new CliError(
    ONTOLOGY_ERROR_CODES.pageLimit,
    `The object-type list has more than ${maxPages} pages.`,
    {
      exitCode: EXIT_CODES.GENERAL_ERROR,
      fix: "Report this to Frontal: the ontology is larger than the CLI can sync.",
    }
  );
}

/** Names a file in a user-facing message: `.frontal/<name>`. */
export function frontalPath(file: string): string {
  return `.frontal/${file}`;
}
