import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

export function readDefinitionFile(path: string): Record<string, unknown> {
  const absPath = resolve(path);
  const content = readFileSync(absPath, "utf-8");

  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return YAML.parse(content) as Record<string, unknown>;
  }

  return JSON.parse(content) as Record<string, unknown>;
}

export function writeOutputFile(path: string, data: Buffer | Uint8Array): void {
  writeFileSync(resolve(path), data);
}
