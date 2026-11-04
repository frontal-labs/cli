import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function writeOutputFile(path: string, data: Buffer | Uint8Array): void {
  writeFileSync(resolve(path), data);
}
