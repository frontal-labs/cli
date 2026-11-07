# Buildkite pipeline for `frontal-labs/cli`

This directory contains the Buildkite CI/CD pipeline for the Frontal CLI repo.

## Stack and real commands

The repo is a Bun (1.3.8) TypeScript CLI. Every stage script below runs the
repo's real commands from `package.json`:

| Stage | Command | Produces |
|-------|---------|----------|
| Lint & type-check | `bun run lint` → `biome lint src/ tests/` then `bun run type-check` | — |
| Build | `bun run build` (`generate:openapi-ops && validate:bindings && tsup`) then `bun run build:binary` | `dist/index.js`, `dist/cli` |
| Test | `vitest run --reporter=junit --shard N/M` | `junit.xml` |
| Integration | `dist/cli init/types/dev/deploy --dry-run` + `bun scripts/run-readme-blocks.ts` | — |
| Deploy staging | `docker buildx build --push ghcr.io/frontal-labs/cli:<sha>,:staging` | container image |
| Deploy prod | `bun run build && bun run build:binaries`, `npm publish`, GitHub Packages, GitHub Release | npm package + release |

## Pipeline layout

```
.buildkite/
├── pipeline.yml          # step definitions (uploaded by buildkite-agent)
├── cache.yml             # Buildkite cache definition (bun install cache)
├── hooks/
│   └── pre-command       # tool setup: installs Bun on every agent
├── scripts/
│   ├── bootstrap.sh      # bun toolchain + bun install --frozen-lockfile
│   ├── lint.sh
│   ├── build.sh
│   ├── test.sh           # parallel vitest shards, JUnit report
│   ├── integration.sh    # downloads build artifacts, smoke tests them
│   ├── deploy-staging.sh # Docker image → ghcr (main branch only)
│   └── deploy-prod.sh    # npm + GitHub Release (main branch only, approval-gated)
└── README.md
```

## Creating the pipeline in Buildkite

In Buildkite, create a pipeline for `git@github.com:frontal-labs/cli.git`:

1. **Repository:** `github.com/frontal-labs/cli`
2. **Steps:** `buildkite-agent pipeline upload .buildkite/pipeline.yml`
3. **Branch configuration:** `main` (this becomes `pipeline.default_branch`)
4. **Environment (on the upload step):** `BUILDKITE_FETCH_DIFF_BASE=true`
   — keeps `if_changed` change detection accurate when `main` is merged into
   feature branches.
5. **Webhooks:** turn on GitHub webhooks in the pipeline settings, then add the
   Buildkite webhook URL to the GitHub repository (Settings → Webhooks). Enable
   both **push** and **pull request** events so PR builds run.
6. **Default branch:** set to `main`.
7. **Signed pipelines:** enable "Signed pipelines" on the pipeline and require
   signatures; production steps run on the `deploy` queue whose agents verify
   step signatures (see [signed pipelines](https://buildkite.com/docs/agent/self-hosted/security/signed-pipelines)).

Equivalent REST API call (replace `{ORG}`, `{SLUG}`, and the token):

```bash
curl -X POST "https://api.buildkite.com/v2/organizations/{ORG}/pipelines" \
  -H "Authorization: Bearer $BUILDKITE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "frontal-cli",
    "slug": "frontal-cli",
    "repository": "git@github.com:frontal-labs/cli.git",
    "branch_configuration": "main",
    "steps": "buildkite-agent pipeline upload .buildkite/pipeline.yml",
    "provider": {
      "settings": {
        "trigger_mode": "code",
        "build_pull_requests": true,
        "build_pull_requests_forks": false
      }
    }
  }'
```

## Queues

| Queue | Steps | Purpose |
|-------|-------|---------|
| `default` | lint, build, test, integration, deploy-staging | CI and staging deploy |
| `deploy` | deploy-prod | Production deploys only |

Production deploys additionally use `concurrency: 1` with
`concurrency_group: "frontal-cli/prod"` so only one prod deploy runs at a time,
and a manual `block` gate before them.

## Caching

`.buildkite/cache.yml` defines a `bun-install` cache keyed by OS/arch and the
`bun.lock` checksum, targeting `~/.bun/install/cache`. Stage scripts restore it
before `bun install --frozen-lockfile` and save it afterwards. On Buildkite
hosted agents no cache store URL is required; self-hosted agents need
`BUILDKITE_AGENT_CACHE_STORE_URL` pointing at an S3-compatible bucket and a
default cache registry on the cluster.

## Secrets

No secrets are stored in this repository. Scripts read them at runtime with
`buildkite-agent secret get` (or from environment variables when run locally).

Create these secrets in Buildkite (Pipeline settings → Secrets, or via the
agent CLI / API):

| Secret | Used by | Purpose |
|--------|---------|---------|
| `GITHUB_TOKEN` | deploy-staging, deploy-prod | `ghcr.io` login + GitHub Packages publish (packages:write) |
| `NPM_TOKEN` | deploy-prod | Publish `frontal-cli` to npm (or use npm OIDC trusted publishing instead) |
| `HOMEBREW_TAP_PAT` | (see below) | Update the `frontal-labs/cli` Homebrew tap |

Cloud credentials (AWS/GCP) should use **OIDC**: configure an OIDC provider on
the cluster running the `deploy` queue and assume cloud roles from the job's
OIDC token rather than storing long-lived access keys. See
[Buildkite OIDC](https://buildkite.com/docs/pipelines/security/oidc).

Homebrew tap updates are invoked from `scripts/setup-homebrew-tap.sh` (existing
in the repo) with `HOMEBREW_TAP_PAT`; add it as an optional final step in
`deploy-prod.sh` if you publish Homebrew releases.

## Reliability

- `timeout_in_minutes` on every step (including the production block).
- `retry.automatic` with `exit_status: -1` and `limit: 2` on all CI steps
  (retry when an agent is lost).
- Deploy steps have no automatic retries; prod deploys cannot be retried
  manually — re-run from the block gate instead.
- Test results are uploaded as `junit.xml` via `artifact_paths` and picked up by
  Buildkite Test Analytics.

## Agents required

- `default` queue: Linux agent with Bun, Node (vitest), Docker (buildx for
  multi-arch staging images) and the Buildkite agent (≥ 3.103 for `if_changed`).
- `deploy` queue: agent with Bun, `npm`, `gh` CLI, Docker registry credentials
  via `buildkite-agent secret get`, and OIDC configured for cloud credentials.

## Running the stage scripts locally

Every script starts with `set -euo pipefail` and sources
`.buildkite/scripts/bootstrap.sh`, which installs Bun and runs
`bun install --frozen-lockfile`, so they run outside Buildkite too:

```bash
# One-off
.buildkite/scripts/lint.sh
.buildkite/scripts/build.sh
.buildkite/scripts/test.sh

# All CI stages in order
.buildkite/scripts/lint.sh && \
.buildkite/scripts/build.sh && \
.buildkite/scripts/test.sh && \
.buildkite/scripts/integration.sh
```

`integration.sh` downloads build artifacts with `buildkite-agent` on Buildkite;
locally it expects `dist/` from a preceding `build.sh` run.

Deploy scripts require `buildkite-agent secret get` (or the corresponding env
vars: `GITHUB_TOKEN`, `NPM_TOKEN`) and Docker, so they are meant to run on
Buildkite agents.

## Verification checklist

1. **PR build passes:** open a PR → lint, build, test (4 parallel shards) and
   integration all green.
2. **Broken test fails the build:** introduce a failing test → the `test` step
   fails and blocks `deploy-staging`.
3. **Main deploys to staging:** merge to main → `deploy-staging` builds and
   pushes `ghcr.io/frontal-labs/cli:<sha>` and `:staging`.
4. **Prod waits for approval:** merge to main → the build pauses at the
   `:construction: Deploy to production` block until someone approves it; then
   `deploy-prod` runs on the `deploy` queue, one at a time
   (`concurrency_group: "frontal-cli/prod"`).
