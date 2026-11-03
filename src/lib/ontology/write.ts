import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type WriteOutcome = "created" | "updated" | "unchanged";

/**
 * Writes `content` to `target` atomically (temp file, then rename). Does not
 * touch the file when its content already matches. A crash between the two
 * steps leaves only a `*.tmp` file, which nothing reads.
 */
export function writeFileAtomic(target: string, content: string): WriteOutcome {
  const existed = existsSync(target);
  if (existed && readFileSync(target, "utf-8") === content) {
    return "unchanged";
  }
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, target);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
  return existed ? "updated" : "created";
}
