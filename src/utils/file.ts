import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import {
  type FrontalProjectConfig,
  frontalConfigSchema,
} from "@/schemas/frontal-json.js";

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

export function readFrontalJson(dir?: string): FrontalProjectConfig {
  const filePath = join(dir ?? process.cwd(), "frontal.json");
  if (!existsSync(filePath)) {
    throw new Error(
      `No frontal.json found in ${dir ?? process.cwd()}. Run 'frontal init' to create one.`
    );
  }
  const content = readFileSync(filePath, "utf-8");
  const raw = JSON.parse(content);
  const result = frontalConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid frontal.json:\n${issues}`);
  }
  return result.data;
}

export function writeFrontalJson(
  config: FrontalProjectConfig,
  dir?: string
): void {
  const filePath = join(dir ?? process.cwd(), "frontal.json");
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function frontalJsonExists(dir?: string): boolean {
  return existsSync(join(dir ?? process.cwd(), "frontal.json"));
}
