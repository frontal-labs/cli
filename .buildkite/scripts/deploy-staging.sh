#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/bootstrap.sh"

DOCKER_IMAGE="${DOCKER_IMAGE:-ghcr.io/frontal-labs/cli}"
COMMIT_SHORT="${BUILDKITE_COMMIT:-$(git rev-parse --short HEAD)}"

# Registry credentials come from Buildkite secrets, never from this repo.
if command -v buildkite-agent >/dev/null 2>&1; then
  GITHUB_TOKEN="$(buildkite-agent secret get GITHUB_TOKEN)"
else
  GITHUB_TOKEN="${GITHUB_TOKEN:?set GITHUB_TOKEN to run locally}"
fi

echo "--- :docker: Logging into GitHub Container Registry"
printf '%s\n' "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GITHUB_USERNAME:-frontal-labs}" --password-stdin

TAGS="${DOCKER_IMAGE}:${COMMIT_SHORT},${DOCKER_IMAGE}:staging"

echo "--- :docker: Building and pushing ${TAGS}"
if docker buildx version >/dev/null 2>&1; then
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag "${TAGS}" \
    --push \
    .
else
  docker build --tag "${DOCKER_IMAGE}:${COMMIT_SHORT}" .
  docker push "${DOCKER_IMAGE}:${COMMIT_SHORT}"
  docker tag "${DOCKER_IMAGE}:${COMMIT_SHORT}" "${DOCKER_IMAGE}:staging"
  docker push "${DOCKER_IMAGE}:staging"
fi

docker logout ghcr.io >/dev/null 2>&1 || true
