# v2 Migration Guide

Frontal CLI v2 is a clean break from the legacy command tree.

## Scope

v2 Phase 1 only includes public API-aligned commands:

- `auth`
- `config`
- `workflows`
- `invocations`
- `runs`
- `events`
- `migrate-legacy`
- `init`, `types` (project workflow)

## Transport

All API calls go through `@frontal-labs/sdk`; there is no CLI-owned HTTP client.
Request bodies are sent in `snake_case` and responses come back in `camelCase`.

## Contract enforcement

v2 command bindings are validated against OpenAPI:

```bash
bun run generate:openapi-ops
bun run validate:bindings
```

`generate:openapi-ops` now uses `https://openapi.frontal.dev/openapi.spec3.yaml`
as the primary source. If unreachable, it falls back to local
`../openapi/openapi/openapi.spec3.yaml` unless `OPENAPI_SPEC_STRICT=1`.

You can override source URL with `OPENAPI_SPEC_URL`.

## Migration helper

Use:

```bash
frontal migrate-legacy
```

To print the legacy->current command mapping and local config compatibility checks.

## JSON scripting contract

When `--json` is set:

- Output is JSON-only on stdout
- Errors are emitted as structured JSON on stderr (`error.code`, `error.message`, `error.fix`, `error.docs`, `error.requestId`, `error.statusCode`)
- Secrets (API keys, tokens) are redacted in every output mode
- Exit codes remain stable for auth, validation, network, timeout, and generic failures
