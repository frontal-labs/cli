#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/bootstrap.sh"

echo "--- :mag: Lint (biome)"
# Real command: package.json "lint" script = biome lint src/ tests/
bun run lint

echo "--- :ts: Type-check"
# Real command: package.json "type-check" script
bun run type-check
