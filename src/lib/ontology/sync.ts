import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "@/errors/cli-error.js";
import { versionSchema } from "@/lib/ontology/backend.js";
import {
  ONTOLOGY_FILES,
  type OntologyFileKey,
  WRITE_ORDER,
} from "@/lib/ontology/constants.js";
import {
  buildDocument,
  type OntologyDocument,
  parseDocument,
  renderDocument,
} from "@/lib/ontology/document.js";
import {
  missingSnapshot,
  ONTOLOGY_ERROR_CODES,
  type StaleFile,
} from "@/lib/ontology/errors.js";
import { generateFiles } from "@/lib/ontology/generate.js";
import type { NormalizedOntology } from "@/lib/ontology/model.js";
import { normalizeOntology } from "@/lib/ontology/normalize.js";
import {
  assertReferenceWritable,
  referenceContent,
  type TypesReference,
  writeReference,
} from "@/lib/ontology/reference.js";
import {
  removeStaleTemporaries,
  type WriteOutcome,
  type Writer,
  writeFileAtomic,
} from "@/lib/ontology/write.js";

/** Where the generated files live and which CLI version writes them. */
export interface OntologyContext {
  /** Absolute path of the project's `.frontal/` directory. */
  frontalDir: string;
  generatorVersion: string;
  /** Reference file that makes the typed SDK registry visible; omitted to skip it. */
  typesReference?: TypesReference;
}

/** Produces the raw object types. Injected so tests and status need no network. */
export type ObjectTypeSource = () => Promise<unknown[]>;

export interface FileChange {
  file: string;
  outcome: WriteOutcome;
}

export interface SyncOutcome {
  entityCount: number;
  /** One entry per generated file, in write order. */
  files: FileChange[];
  /** Temp files from an interrupted earlier sync that were deleted. */
  removedTemporaries: string[];
  schemaHash: string;
  /** The reference file, when the context asks for one; `undefined` otherwise. */
  typesReference: { file: string; outcome: WriteOutcome } | undefined;
  warnings: string[];
}

/** Validated model and document for one snapshot of the backend. */
export interface Snapshot {
  document: OntologyDocument;
  model: NormalizedOntology;
}

/**
 * Validates raw object types once and builds both the model and the document.
 * Throws `ONTOLOGY_INVALID` before anything is written.
 */
export function snapshotOf(raw: readonly unknown[]): Snapshot {
  const model = normalizeOntology(raw);
  return { document: buildDocument(raw), model };
}

/** Expected bytes of every generated file for a snapshot. */
function expectedContents(
  snapshot: Snapshot,
  generatorVersion: string
): Record<OntologyFileKey, string> {
  const generated = generateFiles(snapshot.model, {
    generatorVersion,
    schemaHash: snapshot.document.schemaHash,
  });
  return { ...generated, document: renderDocument(snapshot.document) };
}

/**
 * Fetches, validates, generates and writes every file. Validation happens
 * before any write, so malformed input leaves `.frontal/` untouched.
 * `ontology.json` is written last (see WRITE_ORDER).
 */
export async function syncOntology(
  context: OntologyContext,
  source: ObjectTypeSource,
  write: Writer = writeFileAtomic
): Promise<SyncOutcome> {
  const removedTemporaries = removeStaleTemporaries(context.frontalDir);
  const snapshot = snapshotOf(await source());
  const contents = expectedContents(snapshot, context.generatorVersion);
  const meta = {
    generatorVersion: context.generatorVersion,
    schemaHash: snapshot.document.schemaHash,
  };
  // Refuse before any write, so a file we do not own leaves .frontal/ untouched.
  if (context.typesReference) {
    assertReferenceWritable(context.typesReference);
  }

  const files: FileChange[] = WRITE_ORDER.map((key) => ({
    file: ONTOLOGY_FILES[key],
    outcome: write(
      join(context.frontalDir, ONTOLOGY_FILES[key]),
      contents[key]
    ),
  }));
  const typesReference = context.typesReference
    ? {
        file: context.typesReference.displayPath,
        outcome: writeReference(
          context.typesReference,
          referenceContent(context.typesReference, meta),
          write
        ),
      }
    : undefined;

  return {
    entityCount: snapshot.model.entities.length,
    files,
    removedTemporaries,
    schemaHash: snapshot.document.schemaHash,
    typesReference,
    warnings: snapshot.model.warnings,
  };
}

/** Reads and verifies the committed `ontology.json`. */
function readCommittedDocument(frontalDir: string): OntologyDocument {
  const path = join(frontalDir, ONTOLOGY_FILES.document);
  if (!existsSync(path)) {
    throw missingSnapshot();
  }
  return parseDocument(readFileSync(path, "utf-8"));
}

/** Reads a committed file, or undefined when it does not exist. */
function readOptional(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf-8") : undefined;
}

/** `version.json` is stale in a specific way when its hash disagrees with `ontology.json`. */
function versionHashDisagrees(text: string, schemaHash: string): boolean {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return false;
  }
  const parsed = versionSchema.safeParse(json);
  return parsed.success && parsed.data.schemaHash !== schemaHash;
}

export interface CheckOutcome {
  entityCount: number;
  schemaHash: string;
  stale: StaleFile[];
}

/**
 * Offline check: regenerates from the committed `ontology.json` and compares
 * each generated file byte for byte. Never touches the network.
 */
export function checkOntology(context: OntologyContext): CheckOutcome {
  const document = readCommittedDocument(context.frontalDir);
  const model = normalizeOntology(document.objectTypes);
  const snapshot: Snapshot = { document, model };
  const contents = expectedContents(snapshot, context.generatorVersion);

  const stale: StaleFile[] = [];
  for (const key of WRITE_ORDER) {
    if (key === "document") {
      continue;
    }
    const file = ONTOLOGY_FILES[key];
    const onDisk = readOptional(join(context.frontalDir, file));
    if (onDisk === undefined) {
      stale.push({ file, reason: "missing" });
    } else if (onDisk !== contents[key]) {
      const hashMismatch =
        key === "version" && versionHashDisagrees(onDisk, document.schemaHash);
      stale.push({ file, reason: hashMismatch ? "hash-mismatch" : "differs" });
    }
  }
  if (context.typesReference) {
    const reference = context.typesReference;
    const expected = referenceContent(reference, {
      generatorVersion: context.generatorVersion,
      schemaHash: document.schemaHash,
    });
    const onDisk = readOptional(reference.file);
    if (onDisk === undefined) {
      stale.push({ file: reference.displayPath, reason: "missing" });
    } else if (onDisk !== expected) {
      stale.push({ file: reference.displayPath, reason: "differs" });
    }
  }
  return {
    entityCount: model.entities.length,
    schemaHash: document.schemaHash,
    stale,
  };
}

/** The committed snapshot as `status` sees it. */
export type LocalSnapshot =
  | { state: "synced"; schemaHash: string; entityCount: number }
  | { state: "missing" }
  | { state: "unreadable"; problem: string };

export interface StatusOutcome {
  local: LocalSnapshot;
  remote: { entityCount: number; schemaHash: string };
  upToDate: boolean;
}

function readLocal(frontalDir: string): LocalSnapshot {
  try {
    const document = readCommittedDocument(frontalDir);
    return {
      entityCount: document.objectTypes.length,
      schemaHash: document.schemaHash,
      state: "synced",
    };
  } catch (err) {
    if (err instanceof CliError && err.code === ONTOLOGY_ERROR_CODES.missing) {
      return { state: "missing" };
    }
    if (err instanceof CliError) {
      return { problem: err.message, state: "unreadable" };
    }
    throw err;
  }
}

/** Compares the committed snapshot with Frontal. Makes one remote read. */
export async function statusOntology(
  context: OntologyContext,
  source: ObjectTypeSource
): Promise<StatusOutcome> {
  const snapshot = snapshotOf(await source());
  const local = readLocal(context.frontalDir);
  return {
    local,
    remote: {
      entityCount: snapshot.model.entities.length,
      schemaHash: snapshot.document.schemaHash,
    },
    upToDate:
      local.state === "synced" &&
      local.schemaHash === snapshot.document.schemaHash,
  };
}
