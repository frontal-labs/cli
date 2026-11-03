import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import {
  buildDocument,
  type OntologyDocumentData,
  parseDocument,
  renderDocument,
} from "@/lib/ontology/document.js";
import { type GeneratedFiles, generateFiles } from "@/lib/ontology/generate.js";
import {
  type NormalizedOntology,
  normalizeOntology,
} from "@/lib/ontology/model.js";
import { type WriteOutcome, writeFileAtomic } from "@/lib/ontology/write.js";

/** Generated file names inside the `.frontal/` directory. */
export const ONTOLOGY_FILES = {
  client: "client.ts",
  document: "ontology.json",
  types: "ontology.d.ts",
  version: "version.json",
} as const;

/** Safety bound for paging through the object-type list. */
const MAX_PAGES = 1000;

/** Structural subset of the SDK's PageResult, so tests can supply fake pages. */
export interface PageLike<T> {
  data: T[];
  nextPage: () => Promise<PageLike<T> | null>;
  pagination: { hasMore: boolean };
}

const pagesExceeded = (): CliError =>
  new CliError(
    "ONTOLOGY_PAGINATION",
    `Object-type list exceeded ${MAX_PAGES} pages.`,
    { exitCode: EXIT_CODES.GENERAL_ERROR }
  );

/**
 * Reads pages in sequence (each cursor depends on the previous page), bounded
 * by MAX_PAGES. Recursive so no await sits inside a loop.
 */
async function readPages<T>(
  page: PageLike<T>,
  items: T[],
  pagesLeft: number
): Promise<T[]> {
  for (const item of page.data) {
    items.push(item);
  }
  if (!page.pagination.hasMore) {
    return items;
  }
  if (pagesLeft <= 1) {
    throw pagesExceeded();
  }
  const next = await page.nextPage();
  if (next === null) {
    throw new CliError(
      "ONTOLOGY_PAGINATION",
      "Frontal ended the object-type list early (hasMore was true but no next page was returned).",
      {
        exitCode: EXIT_CODES.NETWORK_ERROR,
        fix: "Retry `frontal sync`. If it persists, report the request id.",
      }
    );
  }
  return readPages(next, items, pagesLeft - 1);
}

/** Collects every item across pages, bounded by MAX_PAGES. */
export function collectPages<T>(first: PageLike<T>): Promise<T[]> {
  return readPages(first, [], MAX_PAGES);
}

/** Fetches every raw object type from Frontal. Injected so tests need no network. */
export type ObjectTypeFetcher = () => Promise<unknown[]>;

export interface OntologyContext {
  /** Absolute path of the project's `.frontal/` directory. */
  frontalDir: string;
  generatorVersion: string;
}

export interface SyncOutcome {
  entityCount: number;
  files: Record<keyof typeof ONTOLOGY_FILES, WriteOutcome>;
  schemaHash: string;
  warnings: string[];
}

/** Expected content of every generated file, in write order. */
function expectedFiles(
  data: OntologyDocumentData,
  model: NormalizedOntology,
  generatorVersion: string
): Record<keyof typeof ONTOLOGY_FILES, string> {
  const generated: GeneratedFiles = generateFiles(model, {
    generatorVersion,
    schemaHash: data.schemaHash,
  });
  return {
    client: generated.clientTs,
    document: renderDocument(data),
    types: generated.ontologyDts,
    version: generated.versionJson,
  };
}

/**
 * Fetches, validates, generates and writes the ontology files. Validation
 * happens before any write, so malformed input leaves the project untouched.
 * `ontology.json` is written last: it is the commit marker that `check` and
 * `status` read, so an interrupted sync is never reported as up to date.
 */
export async function syncOntology(
  context: OntologyContext,
  fetchObjectTypes: ObjectTypeFetcher
): Promise<SyncOutcome> {
  const raw = await fetchObjectTypes();
  const data = buildDocument(raw);
  const model = normalizeOntology(raw);
  const contents = expectedFiles(data, model, context.generatorVersion);

  const order: (keyof typeof ONTOLOGY_FILES)[] = [
    "types",
    "client",
    "version",
    "document",
  ];
  const files = {} as Record<keyof typeof ONTOLOGY_FILES, WriteOutcome>;
  for (const key of order) {
    files[key] = writeFileAtomic(
      join(context.frontalDir, ONTOLOGY_FILES[key]),
      contents[key]
    );
  }

  return {
    entityCount: model.entities.length,
    files,
    schemaHash: data.schemaHash,
    warnings: model.warnings,
  };
}

export interface CheckOutcome {
  schemaHash: string;
  /** Generated files that are missing or differ from what the committed ontology.json produces. */
  stale: string[];
}

/**
 * Offline check: regenerates from the committed `ontology.json` and compares
 * against the committed generated files. Never touches the network.
 */
export function checkOntology(context: OntologyContext): CheckOutcome {
  const documentPath = join(context.frontalDir, ONTOLOGY_FILES.document);
  if (!existsSync(documentPath)) {
    throw new CliError(
      "ONTOLOGY_MISSING",
      ".frontal/ontology.json not found.",
      {
        exitCode: EXIT_CODES.VALIDATION_ERROR,
        fix: "Run `frontal sync` and commit the .frontal/ directory.",
      }
    );
  }
  const data = parseDocument(readFileSync(documentPath, "utf-8"));
  const model = normalizeOntology(data.objectTypes);
  const contents = expectedFiles(data, model, context.generatorVersion);

  const stale: string[] = [];
  for (const key of Object.keys(
    ONTOLOGY_FILES
  ) as (keyof typeof ONTOLOGY_FILES)[]) {
    const file = join(context.frontalDir, ONTOLOGY_FILES[key]);
    const onDisk = existsSync(file) ? readFileSync(file, "utf-8") : undefined;
    if (onDisk !== contents[key]) {
      stale.push(ONTOLOGY_FILES[key]);
    }
  }
  return { schemaHash: data.schemaHash, stale };
}

export interface StatusOutcome {
  /** Hash of the committed ontology.json, or undefined when missing or corrupt. */
  localHash?: string;
  /** Why the local snapshot could not be used, when it exists but is unusable. */
  localProblem?: string;
  remoteEntityCount: number;
  remoteHash: string;
  upToDate: boolean;
}

/** Compares the committed snapshot with the remote ontology (one fetch). */
export async function statusOntology(
  context: OntologyContext,
  fetchObjectTypes: ObjectTypeFetcher
): Promise<StatusOutcome> {
  const remote = buildDocument(await fetchObjectTypes());
  const remoteEntityCount = normalizeOntology(remote.objectTypes).entities
    .length;

  const documentPath = join(context.frontalDir, ONTOLOGY_FILES.document);
  let localHash: string | undefined;
  let localProblem: string | undefined;
  if (existsSync(documentPath)) {
    try {
      localHash = parseDocument(readFileSync(documentPath, "utf-8")).schemaHash;
    } catch (err) {
      localProblem = err instanceof Error ? err.message : String(err);
    }
  } else {
    localProblem = "not synced yet";
  }

  return {
    localHash,
    localProblem,
    remoteEntityCount,
    remoteHash: remote.schemaHash,
    upToDate: localHash === remote.schemaHash,
  };
}
