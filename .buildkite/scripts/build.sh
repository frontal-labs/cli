#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/bootstrap.sh"

# Build offline on pull requests (no network access to the OpenAPI spec).
# Set OPENAPI_SPEC_STRICT=1 for release builds.
export OPENAPI_SPEC_STRICT="${OPENAPI_SPEC_STRICT:-0}"

echo "--- :package: Build npm bundle"
# Real command: package.json "build" script
#   generate:openapi-ops && validate:bindings && tsup && chmod +x dist/index.js
bun run build

echo "--- :binary: Build single binary (host platform)"
# Real command: package.json "build:binary" script → dist/cli
bun run build:binary
