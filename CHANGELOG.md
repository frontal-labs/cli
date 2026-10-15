# Changelog

## 0.2.0

### Minor Changes

- aea0444: Add `frontal deploy`, `frontal promote` and `frontal rollback`.
  
  - `deploy` bundles `entry` from `frontal.jsonc` with `bun build`, writes a manifest (state schema only), and uploads the worker as `<name>-preview` (default) or `<name>` (`--prod`, confirmation unless `--yes`). `--dry-run` works fully offline. Prints `<apiUrl>/workers/<name>` and the request id.
  - Every deployment is recorded under `.frontal/state/deploys/` with an immutable artifact copy, so `promote <url>` and `rollback [url]` re-send exactly what was deployed without rebuilding.
  - `env push` now targets the recorded deployment.
- 75900eb: Add `frontal dev`: a local Frontal API for the project that needs no API key.
  
  - Serves `agents`, `graph`, `datasets`, `blob`, `observability` and `governance` from SDK-compatible fixtures persisted under `.frontal/state/` (JSON per record, gitignored); `GET /health` is always local.
  - `--scenario <name>` replays `.frontal/scenarios/<name>.json` routes (same shape as `MockRoute` in `@frontal-labs/testing`, with `times`); scenario routes override built-ins.
  - `--remote a,b` proxies services to the real API through the SDK (`X-Frontal-Dev-Proxy` header, SDK-shaped error envelopes); the startup line reports `[local]`/`[remote]` per service.
  - Live reload of `frontal*.jsonc`, `.env.local` and scenario files; every response carries `X-Request-Id`; request log on stderr or as NDJSON with `--json`; clean Ctrl+C shutdown.
  - Runs on `node:http`, so it works from the npm bundle under Node and from the compiled binary.
- 64b7e58: Add `frontal env pull|push`, `frontal logs` and `frontal policy check`.
  
  - `env pull [file] [--force]` writes `.env.local` from `frontal.jsonc` (`apiUrl`, `secrets.required`, `vars`) and the active credential; never overwrites without `--force`; secret values are never printed.
  - `env push [file]` validates required secrets, verifies the credential and redeploys the current deployment with the variables (`POST /workers` with `env_vars` sent verbatim — the SDK's `workers.deploy` transform would lowercase variable names).
  - `logs [--follow] [--filter] [--since] [--level] [--limit]` queries `observability.logs.query`; `--follow` tails the SSE stream with reconnect/backoff and clean Ctrl+C.
  - `policy check [--strict] [--user] [--role]` validates local policy files, checks deploy access per enabled service (`access.check`), lists active policies and reads the compliance score; exit 1 on deny, `--strict` promotes warnings.
  - `frontal dev` gains local `workers`, `auth/account/profile` and a `key:value` log query language so all three commands work offline.
  - SDK handles accept an abort signal (`getSdk(opts, { signal })`) that cancels open SSE streams.
- b49725b: Add the project workflow: `frontal init` and `frontal types`.
  
  - `frontal init [--name <dir>] [--force]` creates `frontal.jsonc`, `.env.example`, `.gitignore` entries, `src/.gitkeep` and (only if missing) `package.json`; never overwrites without `--force`.
  - `frontal types [--out]` generates `FrontalEnv`/`FrontalVars`/`FrontalSecrets`/`FrontalServices`/`FrontalProject` typings from `frontal.jsonc`, with `NodeJS.ProcessEnv` augmentation.
  - `frontal.jsonc` is validated with a schema composed from the SDK's `clientConfigSchema`; per-environment overlays (`frontal.<env>.jsonc`, `--env`) and `.env.local` are honoured when resolving credentials and the API URL.
  - npm bin is now `dist/index.js`; `bun run build:binary` produces a single executable. Docker image and Homebrew formula updated accordingly.
  - README bash blocks are executed in CI; added `llms.txt`.
- aacc712: Route all API calls through `@frontal-labs/sdk` (pinned 1.0.4) instead of the hand-rolled HTTP client.
  
  - New `src/lib/sdk.ts` factory (`getSdk`) with credential precedence `--api-key` > `FRONTAL_API_KEY` > profile API key > profile OAuth session; OAuth sessions are bridged and auto-refreshed.
  - Errors now always print `code`, a fix hint, a docs link and the request id (also under `--json`); new exit code `6` for configuration errors.
  - Secrets (API keys, bearer tokens, JWTs, `*_token`/`*_key`/`password` fields) are redacted from every output mode.
  - `auth whoami` shows the remote account profile (`--local` to skip); `auth login --method api-key` validates the key before saving.
  - Every command `--help` now shows examples. New global flags `--env` and `--yes`.
  - `FRONTAL_CONFIG_DIR` overrides the `~/.frontal` location.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description
- Another new feature

### Changed
- Modified existing functionality
- Updated dependencies

### Deprecated
- Feature that will be removed in future versions

### Removed
- Feature that has been removed

### Fixed
- Bug fix description
- Another bug fix

### Security
- Security vulnerability fix

## [1.0.0] - 2024-01-15

### Added
- Initial release of Frontal CLI
- Authentication and credential management
- Organization and workspace management
- Team and role-based access control
- Function deployment and management
- Container management
- Workflow and pipeline operations
- Metrics and monitoring
- Log management
- Webhook configuration
- Billing and usage tracking
- AI agent management
- Marketplace integration
- Support ticket management
- Service catalog
- Feature flag management
- Command completion
- Blob storage operations
- Graph database operations
- Ontology management

### Features
- Multi-profile configuration support
- JSON/YAML/table output formats
- Interactive prompts
- Progress indicators
- Error handling and validation
- Comprehensive documentation
- CI/CD integration
- Docker support

### Documentation
- Complete API documentation
- Command reference guide
- Installation and setup guides
- Troubleshooting documentation
- Contributing guidelines

## [0.1.0] - 2024-01-01

### Added
- Project initialization
- Basic CLI structure
- Core dependencies setup
- Development environment configuration
- Testing framework setup
- Documentation structure

---

## Changelog Guidelines

### Categories

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Vulnerability fixes

### Format

```markdown
## [Version] - Date

### Added
- Feature description with issue reference (#123)

### Changed
- Change description with PR reference (#456)

### Fixed
- Bug fix description with issue reference (#789)
```

### Version Numbers

- Follow semantic versioning: MAJOR.MINOR.PATCH
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes (backward compatible)

### Release Process

1. Update version in `package.json`
2. Add changelog entry
3. Create release tag
4. GitHub Actions will:
   - Run tests
   - Build project
   - Publish to NPM
   - Create GitHub release

### Automation

The release workflow automatically:
- Generates changelog from git commits
- Creates GitHub release
- Publishes to NPM
- Updates documentation

### Commit Message Types

- `feat:` New features (Added)
- `fix:` Bug fixes (Fixed)
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Maintenance tasks
- `security:` Security fixes (Security)
- `perf:` Performance improvements (Changed)

### Examples

#### New Feature
```markdown
### Added
- Add support for custom API endpoints (#123)
- Implement function auto-scaling (#124)
```

#### Breaking Change
```markdown
### Changed
- BREAKING: Update authentication flow (#125)
- Modify command output format (#126)
```

#### Bug Fix
```markdown
### Fixed
- Resolve authentication timeout issue (#127)
- Fix memory leak in long-running commands (#128)
```

#### Security Fix
```markdown
### Security
- Fix API key exposure in logs (#129)
- Update dependencies for security vulnerabilities (#130)
```

### Links

- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
