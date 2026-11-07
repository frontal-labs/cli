#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/bootstrap.sh"

echo "--- :package: Build release artifacts"
bun run build
bun run build:binaries

test -x dist/index.js
test -x dist/cli

# A release tag must match the package version (mirrors .github/workflows/publish.yml).
PKG_VERSION="$(node -p "require('./package.json').version")"
if [ -n "${BUILDKITE_TAG:-}" ]; then
  test "v${PKG_VERSION}" = "${BUILDKITE_TAG}" || {
    echo "tag ${BUILDKITE_TAG} does not match package.json v${PKG_VERSION}" >&2
    exit 1
  }
fi

# Publish to npm. The token comes from a Buildkite secret (never from this repo).
# If you configure npm OIDC trusted publishing, replace this with npm's OIDC
# login flow instead of NPM_TOKEN.
if command -v buildkite-agent >/dev/null 2>&1; then
  NPM_TOKEN="$(buildkite-agent secret get NPM_TOKEN)"
else
  NPM_TOKEN="${NPM_TOKEN:?set NPM_TOKEN to run locally}"
fi
printf '//registry.npmjs.org/:_authToken=%s\n' "${NPM_TOKEN}" > .npmrc
trap 'rm -f .npmrc' EXIT

echo "--- :npm: Publishing frontal-cli to npm"
npm publish --ignore-scripts --access public --provenance

# Publish to GitHub Packages (@frontal-labs/cli).
if command -v buildkite-agent >/dev/null 2>&1; then
  GITHUB_TOKEN="$(buildkite-agent secret get GITHUB_TOKEN)"
else
  GITHUB_TOKEN="${GITHUB_TOKEN:?set GITHUB_TOKEN to run locally}"
fi
ORIGINAL_NAME="$(node -p "require('./package.json').name")"
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.name = "@frontal-labs/cli";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
printf 'registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=%s\n' "${GITHUB_TOKEN}" > .npmrc
VERSION="$(node -p "require('./package.json').version")"
if npm view "@frontal-labs/cli@${VERSION}" version --registry=https://npm.pkg.github.com >/dev/null 2>&1; then
  echo "@frontal-labs/cli@${VERSION} already published; skipping"
else
  npm publish --ignore-scripts
fi
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.name = "'"${ORIGINAL_NAME}"'";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
rm -f .npmrc
trap - EXIT

# Create the GitHub Release on tagged builds.
if [ -n "${BUILDKITE_TAG:-}" ] && command -v gh >/dev/null 2>&1; then
  echo "--- :github: Creating GitHub Release ${BUILDKITE_TAG}"
  gh release create "${BUILDKITE_TAG}" dist/index.js dist/cli --notes-file CHANGELOG.md --title "${BUILDKITE_TAG}"
fi
