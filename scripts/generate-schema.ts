#!/usr/bin/env bun
/**
 * Writes schemas/frontal.json — the JSON Schema for frontal.jsonc — from the
 * Zod project schema, so editors get validation and completions via
 * "$schema": "https://frontal.dev/schemas/frontal.json".
 *
 * Usage: bun scripts/generate-schema.ts [--check]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFrontalJsonSchema } from "../src/lib/json-schema.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "schemas", "frontal.json");
const check = process.argv.includes("--check");

const content = `${JSON.stringify(await buildFrontalJsonSchema(), null, 2)}\n`;

if (check) {
  let current = "";
  try {
    current = readFileSync(outFile, "utf-8");
  } catch {
    // missing file counts as stale
  }
  if (current !== content) {
    console.error(
      "schemas/frontal.json is out of date — run `bun run generate:schema`."
    );
    process.exit(1);
  }
  console.log("schemas/frontal.json is up to date");
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, content);
  console.log(`wrote ${outFile}`);
}
