#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const operationsFile = path.resolve(repoRoot, 'src', 'generated', 'openapi-operations.generated.ts');
const bindingsFile = path.resolve(repoRoot, 'src', 'contract', 'command-bindings.ts');

function readTsArrayLiteral(filePath, constName) {
  const src = fs.readFileSync(filePath, 'utf8');
  const marker = `export const ${constName}`;
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error(`Could not find ${constName} in ${filePath}`);
  const assignmentIdx = src.indexOf('=', idx);
  const start = src.indexOf('[', assignmentIdx);
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`Could not parse array for ${constName}`);
  const jsonish = src.slice(start, end + 1)
    .replace(/([\{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(jsonish);
}

function normalizePath(p) {
  if (!p) return '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

const operations = readTsArrayLiteral(operationsFile, 'OPENAPI_OPERATIONS');
const bindings = readTsArrayLiteral(bindingsFile, 'PHASE1_COMMAND_BINDINGS');

const available = new Set(
  operations.map((op) => `${String(op.method).toUpperCase()} ${normalizePath(op.path)}`)
);

const missing = [];
for (const b of bindings) {
  const key = `${String(b.method).toUpperCase()} ${normalizePath(b.path)}`;
  if (!available.has(key)) {
    missing.push({ id: b.id, key });
  }
}

if (missing.length > 0) {
  console.error('Command bindings missing from OpenAPI contract:');
  for (const item of missing) {
    console.error(`- ${item.id}: ${item.key}`);
  }
  process.exit(1);
}

console.log(`Validated ${bindings.length} command bindings against ${available.size} OpenAPI operations.`);
