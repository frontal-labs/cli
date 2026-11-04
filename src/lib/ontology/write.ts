import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { ONTOLOGY_FILES } from "@/lib/ontology/constants.js";

export type WriteOutcome = "created" | "updated" | "unchanged";

/** Writes one file and reports what happened. Injected into `syncOntology` so tests can count writes. */
export type Writer = (target: string, content: string) => WriteOutcome;

/** A unique sibling path: `.<name>.<pid>.<random>.tmp`. */
function temporaryPathFor(target: string): string {
  const unique = `${process.pid}.${randomBytes(4).toString("hex")}`;
  return join(dirname(target), `.${basename(target)}.${unique}.tmp`);
}

/**
 * Writes `content` to `target` through a temp file and a rename, so readers see
 * either the old or the new file, never a partial one. A file whose bytes
 * already match is not touched at all.
 */
export function writeFileAtomic(target: string, content: string): WriteOutcome {
  const existed = existsSync(target);
  if (existed && readFileSync(target, "utf-8") === content) {
    return "unchanged";
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = temporaryPathFor(target);
  try {
    writeFileSync(temporary, content);
    renameSync(temporary, target);
  } catch (err) {
    rmSync(temporary, { force: true });
    throw err;
  }
  return existed ? "updated" : "created";
}

/** True for a temp file left behind by an interrupted write of a generated file. */
export function isStaleTemporary(name: string): boolean {
  return Object.values(ONTOLOGY_FILES).some(
    (file) => name.startsWith(`.${file}.`) && name.endsWith(".tmp")
  );
}

/** Deletes temp files left by interrupted writes. Returns the names removed. */
export function removeStaleTemporaries(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (isStaleTemporary(name)) {
      rmSync(join(dir, name), { force: true });
      removed.push(name);
    }
  }
  return removed;
}
