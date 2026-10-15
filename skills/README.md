# skills/

Tracked Agent Skills for this repo (frontal-cli).

Each subdirectory is one skill (`SKILL.md` + supporting files), installed via
the [`skills` CLI](https://skills.sh/docs/cli) and mirrored here so they are
versioned with the repo. `.agents/skills/` holds the CLI's local working
copies (gitignored); `skills/` is the source of truth.
`skills-lock.json` (repo root) pins every skill's source repo + content hash.

## Update

Re-install / update from the lockfile (project scope):

```bash
npx skills experimental_install
# or update everything to latest:
npx skills update
```

After updating, re-mirror into `skills/`:

```bash
rm -rf skills && mkdir -p skills && cp -r .agents/skills/. skills/
```

(`skills/mattpocock-code-review`, `skills/sentry-security-review`, and
`skills/anthropic-webapp-testing` are manual copies — see "Name collisions"
below — and must be preserved across a re-mirror.)

## What is installed and why

Stack: TypeScript (strict, ESM) · Bun + Node 18 · commander · clack/chalk/ora ·
zod/ajv + JSON Schema · tsup + `bun build --compile` · vitest · biome/ultracite ·
husky/commitlint/changesets · Dockerfile · GitHub Actions (OIDC) · OpenAPI ops
generation · SDK-only HTTP · `.mcp.json` · shell completions.

| Skill | Source | Covers in this repo |
|---|---|---|
| `cli-mastery` | github/awesome-copilot | CLI design (commander command pattern, help, completions) |
| `javascript-typescript-jest` | github/awesome-copilot | TS language + test patterns (adapt Jest bits to vitest) |
| `typescript-mcp-server-generator` | github/awesome-copilot | TS MCP servers (`.mcp.json`) |
| `openapi-to-application-code` | github/awesome-copilot | OpenAPI-driven codegen (`scripts/generate-openapi-operations.mjs`) |
| `multi-stage-dockerfile` | github/awesome-copilot | `Dockerfile`, `docker-compose.yml` |
| `gh-cli` | github/awesome-copilot | `gh` usage (PRs, releases) |
| `create-github-action-workflow-specification` | github/awesome-copilot | `.github/` workflows (OIDC publish, Homebrew) |
| `gha-security-review` | getsentry/skills | CI workflow security (`.github/workflows/`) |
| `git-commit`, `conventional-commit`, `git-flow-branch-creator` | github/awesome-copilot | commitlint + husky + changesets flow |
| `commit` | getsentry/skills | Conventional-commit drafting |
| `git-guardrails-claude-code` | mattpocock/skills | Block destructive git ops in agent sessions |
| `setup-pre-commit` | mattpocock/skills | Husky + lint-staged setup |
| `editorconfig` | github/awesome-copilot | `.editorconfig` |
| `deno`, `migrate-to-deno` | denoland/skills | Closest JS-runtime skills on skills.sh (no Bun skill exists): ESM/CJS, `package.json` scripts, lockfiles, toolchain. Deno-only bits do not apply |
| `architecture-blueprint-generator`, `folder-structure-blueprint-generator`, `create-architectural-decision-record` | github/awesome-copilot | `src/commands\|config\|output\|schemas` structure, ADRs |
| `codebase-design`, `improve-codebase-architecture`, `domain-modeling` | mattpocock/skills | Deep modules, Command/Factory/Strategy/Observer patterns (`docs/ARCHITECTURE.md`) |
| `implement`, `implement-spec`, `to-spec`, `to-tickets`, `research` | mattpocock/skills | Spec → tickets → implement loop |
| `refactor`, `refactor-plan`, `review-and-refactor` | github/awesome-copilot | Gradual refactors |
| `code-review` (Sentry) | getsentry/skills | PR review: security, performance, testing, design |
| `mattpocock-code-review` | mattpocock/skills | Standards-vs-Spec dual review (namespaced; see below) |
| `requesting-code-review`, `receiving-code-review` | obra/superpowers | Pre-merge verification, handling review feedback |
| `pr` | mattpocock/skills | PR bodies |
| `tdd`, `test-driven-development` | mattpocock/skills, obra/superpowers | vitest red-green-refactor |
| `webapp-testing` (Playwright) | github/awesome-copilot | e2e patterns (secondary; CLI uses vitest, not Playwright) |
| `anthropic-webapp-testing` | anthropics/skills | Local-app testing via Playwright (namespaced; see below) |
| `diagnosing-bugs`, `systematic-debugging`, `find-bugs` | mattpocock/skills, obra/superpowers, getsentry/skills | `src/errors/` classification + stable exit codes |
| `verification-before-completion` | obra/superpowers | Verify (`type-check`, `test`, `lint`) before claiming done |
| `code-security`, `semgrep` | semgrep/skills | Secure coding + static analysis (30+ langs, incl. TS) |
| `security-review` (AI scanner) | github/awesome-copilot | Data-flow vuln scanning (creds, injection, secrets) |
| `sentry-security-review` | getsentry/skills | Sentry-style security review (namespaced; see below) |
| `secret-scanning` | github/awesome-copilot | Push protection, custom patterns (`.gitleaks.toml`) |
| `mcp-builder`, `skill-creator`, `writing-skills` | anthropics/skills, obra/superpowers | Authoring skills/MCP servers (incl. this dir) |
| `writing-plans`, `executing-plans`, `brainstorming`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch` | obra/superpowers | Plan → execute → integrate workflow |
| `google-agents-cli-adk-code`, `-scaffold`, `-workflow`, `-deploy`, `-observability`, `-eval` | google/agents-cli | CLI lifecycle precedent mirroring `init/dev/deploy/logs` |
| `documentation-writer`, `create-readme`, `writing-guidelines` | github/awesome-copilot, vercel-labs/agent-skills | `README.md` executable blocks, `docs/`, `llms.txt` |
| `document-api-endpoint` | getsentry/skills | OpenAPI endpoint docs (Sentry-flavored; adapt) |

## Name collisions

Three skill names exist in multiple sources; the CLI keeps one per name
(recorded in `skills-lock.json`) and the losers are preserved under
namespaced dirs:

| Dir | Actual source | Winner in lockfile |
|---|---|---|
| `mattpocock-code-review` | mattpocock/skills | `code-review` ← getsentry/skills |
| `sentry-security-review` | getsentry/skills | `security-review` ← github/awesome-copilot |
| `anthropic-webapp-testing` | anthropics/skills | `webapp-testing` ← github/awesome-copilot |

## Deliberately excluded

- React/Next/Vercel composition, mobile, marketing, and database skills
  (Supabase/Prisma/Neon/etc.): this repo is a CLI, none apply.
- `frontend-design`, `web-design-guidelines`, `ui-ux-pro-max`: web visual
  taste, not CLI output design.
- `mattpocock/skills/setup-ts-deep-modules`: still `in-progress` upstream.
- `deno-deploy`, `deno-frontend`, `deno-sandbox`: Deno-platform-specific.
- `google-agents-cli-publish`: Gemini registry-specific.
- `semgrep/skills/llm-security`: no LLM-app code in this repo.

## Local patches

Deviations from upstream, re-apply after a re-mirror (`rm -rf skills`
flow above preserves only the three namespaced dirs, not these):

- `brainstorming/scripts/server.cjs`: render the server-side `TOKEN`
  instead of echoing the raw `?key=` query value into `bootstrapPage`.
  The `timingSafeEqualStr` guard proves they are equal, so this is
  behavior-identical; it keeps CodeQL `js/reflected-xss` quiet on
  vendored code an attacker without the token cannot exploit.
