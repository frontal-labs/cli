#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/bootstrap.sh"

# Vitest shards are 1-based while Buildkite parallel job indexes are 0-based.
# Running locally (no BUILDKITE_PARALLEL_* vars) executes the full suite: shard 1/1.
SHARD_INDEX="${BUILDKITE_PARALLEL_JOB:-0}"
SHARD_TOTAL="${BUILDKITE_PARALLEL_JOB_COUNT:-1}"
SHARD="$((SHARD_INDEX + 1))/${SHARD_TOTAL}"

echo "--- :vitest: Unit tests (shard ${SHARD})"
# Real command: package.json "test" script = vitest run, run in parallel shards
# with a JUnit report for Buildkite Test Analytics.
bun run vitest run --reporter=junit --outputFile=junit.xml --shard "${SHARD}"

# junit.xml is uploaded via artifact_paths in pipeline.yml.
