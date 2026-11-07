#!/usr/bin/env bash
set -euo pipefail

# Shared by every .buildkite stage script. Guarantees the Bun toolchain and
# installed dependencies, both on Buildkite agents and when run locally.
#
# Source it from the top of each stage script:
#   . "$(dirname "$0")/bootstrap.sh"

export BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
export PATH="${BUN_INSTALL}/bin:${PATH}"

if ! command -v bun >/dev/null 2>&1; then
  echo "--- :bun: Installing Bun ${BUN_VERSION:-1.3.8}"
  BUN_VERSION="${BUN_VERSION:-1.3.8}" curl -fsSL https://bun.sh/install | bash
fi

bun --version

# Restore the dependency cache on Buildkite (a no-op when run locally).
if [ -n "${BUILDKITE:-}" ]; then
  buildkite-agent cache restore --name bun-install || true
fi

bun install --frozen-lockfile

# Save the dependency cache on Buildkite (a no-op when run locally).
if [ -n "${BUILDKITE:-}" ]; then
  buildkite-agent cache save --name bun-install || true
fi
