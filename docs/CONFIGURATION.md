# Configuration

The CLI has two configuration layers:

1. **Project** — `.frontal/config.jsonc` (plus optional `.frontal/config.<env>.jsonc` overlays) and a gitignored `.env.local`.
2. **User** — profiles in `~/.frontal/config.json` managed by `frontal config` / `frontal auth`.

## Resolution order

For the API key and base URL:

1. Command-line flag (`--api-key`, `--api-url`)
2. Shell environment (`FRONTAL_API_KEY`, `FRONTAL_API_URL`)
3. `.env.local` in the project
4. `apiUrl` from the project config
5. The active profile (API key, then OAuth session; `baseUrl`)
6. Defaults (`https://api.frontal.dev/v1`)

## Config locations and precedence

The project config is the first file found, in this order, in the project directory or the nearest
parent that has one:

1. `.frontal/config.jsonc` (default; `frontal init` writes this)
2. `.frontal/config.json`
3. `frontal.jsonc` (root, earlier layout)
4. `frontal.json` (root, earlier layout)

Only a config file makes a directory the project root, so a `.frontal/` that holds only `state/`,
`build/` or `policies/` does not count. Keep one project config. When more than one exists, the
first wins and the CLI prints one warning naming the ignored files.

Environment overlays use the same order: `.frontal/config.<env>.jsonc`, `.frontal/config.<env>.json`,
`frontal.<env>.jsonc`, `frontal.<env>.json`. The first one that exists is merged over the base.

`frontal init` keeps an existing config where it is, so it never creates a second one. To move a
legacy file to the default location, run `git mv frontal.jsonc .frontal/config.jsonc`.

Keys from the earlier `frontal.json` web-deploy format (`framework`, `regions`, `build`, `deployment`,
`features`, `functions`, `headers`, `redirects`, `rewrites`) are accepted in any location and validated
against the same rules. No command acts on them yet; they are documented in the schema as legacy
web-deploy settings.

## Project config (`.frontal/config.jsonc`)

```jsonc
{
  "$schema": "https://frontal.dev/schemas/frontal.json",
  "name": "my-app",                  // lowercase letters, digits, dashes
  "env": "dev",                      // dev | staging | prod
  "entry": "src/index.ts",           // bundled by `frontal deploy`
  "apiUrl": "https://api.frontal.dev/v1",
  "services": {
    "ai": { "remote": false },
    "agents": { "remote": false },
    "graph": { "remote": false }
  },
  "vars": { "LOG_LEVEL": "info" },   // UPPER_SNAKE_CASE keys, string values
  "secrets": { "required": ["FRONTAL_API_KEY"] },
  "sdk": { "timeout": 30000, "maxRetries": 3 }   // optional, validated by the SDK schema
}
```

| Field | Description |
|---|---|
| `name` | Project name (`^[a-z0-9][a-z0-9-]*$`) |
| `env` | Default environment; `--env` overrides it |
| `entry` | File bundled by `frontal deploy` (default `src/index.ts`) |
| `apiUrl` | API base URL (http/https) |
| `services` | Map of service → `{ remote }`. Unknown keys are rejected with the list of valid services |
| `agents` | Agent ids owned by the project; `frontal rollback` reverts them to their previous version |
| `vars` | Non-secret configuration written to `.env.local` by `frontal env pull` |
| `secrets.required` | Environment variables that must be set (values never live in this file) |
| `sdk` | Optional `timeout`, `maxRetries`, `retryDelay`, `headers` forwarded to the SDK client |

Valid service keys: `agents`, `ai`, `audit`, `auth`, `billing`, `blob`, `connectors`,
`data`, `datasets`, `events`, `governance`, `graph`, `integrations`, `lineage`,
`observability`, `ontology`, `pipelines`, `sandbox`, `schedules`, `webhooks`,
`workers`, `workflows`.

### JSON Schema

`https://frontal.dev/schemas/frontal.json` (draft 2020-12) is generated from the CLI's Zod
validator by `bun run generate:schema` into `schemas/frontal.json`; CI fails if it is stale.
Point `$schema` at it for editor validation and completions.

### Environment overlays

`.frontal/config.staging.jsonc` (or a legacy `frontal.staging.jsonc`) is deep-merged over the base config
when the environment is selected (`--env staging` or `"env": "staging"`). Overlays
usually only change `apiUrl`, `vars` and `services.*.remote`.

### `.env.local`

Gitignored file holding secret values for local work:

```
FRONTAL_API_KEY=frt_...
FRONTAL_API_URL=https://api.frontal.dev/v1
```

`frontal init` writes `.env.example` as a template; `frontal env pull` writes `.env.local`
from `.frontal/config.jsonc` and your credential, and `frontal env push` uploads the variables
(except the connection settings) to the current deployment.

## Environment variables

| Variable | Purpose |
|---|---|
| `FRONTAL_API_KEY` | API key (`frt_…`) |
| `FRONTAL_API_URL` | API base URL |
| `FRONTAL_ENV` | SDK environment (`development`, `test`, `production`) |
| `FRONTAL_DEBUG` | `1`/`true` to log every request |
| `FRONTAL_PROFILE` | Profile name |
| `FRONTAL_AUTH_URL` | OAuth server for `frontal auth login` (default `https://auth.frontal.dev`) |
| `FRONTAL_CONFIG_DIR` | Profile store location (default `~/.frontal`) |
| `FRONTAL_ORG_ID`, `FRONTAL_WORKSPACE_ID` | Default organization / workspace |

Invalid values for the SDK-validated variables (`FRONTAL_ENV`, `FRONTAL_API_KEY`,
`FRONTAL_API_URL`, `FRONTAL_DEBUG`) are ignored rather than crashing the CLI.

## Profiles (`~/.frontal/config.json`)

```json
{
  "schemaVersion": 2,
  "activeProfile": "default",
  "profiles": {
    "default": { "apiKey": "frt_…", "baseUrl": "https://api.frontal.dev/v1" },
    "staging": { "accessToken": "…", "refreshToken": "…", "tokenExpiresAt": 1900000000, "authUrl": "https://auth.frontal.dev" }
  },
  "telemetry": { "enabled": false },
  "defaults": { "outputFormat": "table", "paginationLimit": 25 }
}
```

```bash
frontal config list
frontal config set baseUrl https://api.staging.frontal.dev/v1 --profile staging
frontal config use staging
frontal config profiles
```
